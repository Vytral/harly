import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { jobStageKindSchema } from "@harly/validators";

import {
  generateJobDraftAction,
  generateScreeningQuestionsAction,
  restoreJobAction,
  trashJobAction,
  updateJobStatusAction,
} from "@/features/jobs/actions";
import { decideJobApproval, getPendingJobApproval, requestJobApproval } from "@/features/jobs/approval";
import { createJob, getDashboardJob, listWorkspaceDepartments, updateJob } from "@/features/jobs/data";
import {
  addHiringTeamMember,
  removeHiringTeamMember,
  updateHiringTeamRole,
} from "@/features/jobs/hiring-team-actions";
import { listJobHiringTeam, listWorkspaceMembers } from "@/features/jobs/hiring-team-data";
import {
  isCareerPageConfigured,
  normalizeCareerPageConfig,
} from "@/features/career-page/config";
import {
  archiveJobStageAction,
  createJobStageAction,
  listJobStagesAction,
  reorderJobStagesAction,
  updateJobStageAction,
} from "@/features/pipeline/stage-actions";
import { isUnrestrictedScope } from "@/features/search/scope";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getRolePolicy, requireJobPermission, requirePermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";

import { defineMcpTool, McpToolError, type McpToolAnnotations, type McpToolDefinition } from "../types";
import {
  applicationFieldKeys,
  applyApplicationFormPatch,
  assertValidJobValues,
  boardUrl,
  buildQuestions,
  clampLimit,
  dashboardJobUrl,
  draftToHtml,
  failure,
  FIELD_VISIBILITY,
  HIRING_TEAM_ROLES,
  JOB_STATUS_FILTERS,
  jobFieldsShape,
  jobRisk,
  jobToFormValues,
  mapActionError,
  mergeJobValues,
  newJobBase,
  publicJobLinks,
  questionInputSchema,
  serializeApplicationForm,
  serializeJobDetail,
  serializeJobListRow,
  WORKPLACE_TYPES,
  type JobFieldsPatch,
} from "./jobs/helpers";
import {
  activeCountsByStage,
  applicationActivity,
  getCareerPageSettings,
  listJobsPage,
  listPendingApprovalsForMe,
  stageAgingForJob,
} from "./jobs/queries";

// Jobs tools. Each one calls the same actions and data functions as the
// dashboard, so role scope (departments, regions, assigned jobs) and the
// jobs:* / hiring_team:manage permissions are enforced by the app itself.

const READ: McpToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const WRITE_IDEMPOTENT: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const WRITE_ONCE: McpToolAnnotations = { ...WRITE_IDEMPOTENT, idempotentHint: false };

const jobIdField = z.uuid().describe("Job id (uuid). Get it from jobs_list.");

/** Run existing app code and translate its thrown failures into tool errors. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return mapActionError(error);
  }
}

type DashboardJob = NonNullable<Awaited<ReturnType<typeof getDashboardJob>>>;

async function loadJob(jobId: string): Promise<DashboardJob> {
  const found = await guard(() => getDashboardJob(jobId));
  if (!found) throw new McpToolError("Job not found, or outside your access.", "not_found");
  return found;
}

function revalidateJobPaths(workspaceSlug: string, job: { id: string; slug: string }) {
  const base = `/board/${workspaceSlug}`;
  revalidatePath("/dashboard/jobs");
  revalidatePath(`/dashboard/jobs/${job.id}`);
  revalidatePath(base);
  revalidatePath(`${base}/jobs/${job.slug}`);
  revalidatePath("/sitemap.xml");
}

/** Roles limited to regions/departments could otherwise create a job they cannot see. */
async function assertCanCreateInScope(department: string | null | undefined) {
  const context = await getWorkspaceContext();
  const policy = await getRolePolicy(context.organization.id, context.roleKey);
  if (isUnrestrictedScope(policy.scope)) return;
  if (policy.scope.regions.length > 0) {
    throw new McpToolError("Your role is limited to specific regions, so you cannot create jobs.", "forbidden");
  }
  if (policy.scope.departments.length > 0) {
    const wanted = department?.trim().toLocaleLowerCase() ?? "";
    const allowed = policy.scope.departments.some((name) => name.trim().toLocaleLowerCase() === wanted);
    if (!allowed) {
      throw new McpToolError(
        `New jobs must be in one of your departments: ${policy.scope.departments.join(", ")}.`,
        "forbidden",
      );
    }
  }
}

async function loadHiringTeam(jobId: string) {
  const team = await listJobHiringTeam(jobId);
  return team.map((member) => ({
    memberId: member.id,
    userId: member.userId,
    name: member.name,
    email: member.email,
    role: member.role,
  }));
}

function serializeStage(stage: {
  id: string;
  name: string;
  kind: string;
  color: string | null;
  order: number;
  archivedAt: Date | null;
  emailConfig: unknown;
  applicationCount: number;
}) {
  const config = stage.emailConfig as { candidateUpdatesEnabled?: boolean } | null;
  return {
    id: stage.id,
    name: stage.name,
    kind: stage.kind,
    color: stage.color,
    order: stage.order,
    applications: stage.applicationCount,
    candidateUpdateEmailsEnabled: config?.candidateUpdatesEnabled !== false,
    archived: stage.archivedAt !== null,
  };
}

async function loadStages(jobId: string, includeArchived = false) {
  const result = await listJobStagesAction({ jobId, includeArchived });
  if (!result.success) failure(result.error, "Could not load the job's stages.");
  return result.stages;
}

/** Shared by update/application-form tools: load, merge, validate, save, revalidate. */
async function saveJobEdits(
  jobId: string,
  mutate: (current: ReturnType<typeof jobToFormValues>) => ReturnType<typeof jobToFormValues>,
) {
  await guard(() => requireJobPermission("jobs:edit", jobId));
  const existing = await loadJob(jobId);
  const next = mutate(jobToFormValues(existing.job));
  assertValidJobValues(next);
  const saved = await guard(() => updateJob(jobId, next));
  if (!saved) throw new McpToolError("Job not found.", "not_found");
  revalidateJobPaths(existing.workspace.slug, saved);
  return { job: saved, workspaceSlug: existing.workspace.slug };
}

async function changeStatus(
  jobId: string,
  status: "draft" | "open" | "closed",
  ctx: { appOrigin: string },
) {
  const current = await loadJob(jobId);
  const links = (job: DashboardJob["job"]) => publicJobLinks(ctx.appOrigin, current.workspace.slug, job);
  if (current.job.status === status) {
    return {
      changed: false,
      id: current.job.id,
      title: current.job.title,
      status: current.job.status,
      publishedAt: current.job.publishedAt?.toISOString() ?? null,
      url: dashboardJobUrl(ctx.appOrigin, current.job.id),
      ...links(current.job),
    };
  }
  const form = new FormData();
  form.set("jobId", jobId);
  form.set("status", status);
  await guard(() => updateJobStatusAction(form));
  const after = await loadJob(jobId);
  return {
    changed: true,
    id: after.job.id,
    title: after.job.title,
    status: after.job.status,
    publishedAt: after.job.publishedAt?.toISOString() ?? null,
    url: dashboardJobUrl(ctx.appOrigin, after.job.id),
    ...links(after.job),
  };
}

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

const listInput = z.object({
  status: z.enum(JOB_STATUS_FILTERS).optional().describe("Only jobs in this status. draft = unpublished, open = live on the career page, closed = no longer hiring."),
  department: z.string().trim().max(120).optional().describe("Exact department name (case-insensitive). Use jobs_list_departments for valid values."),
  location: z.string().trim().max(200).optional().describe("Substring of the job location."),
  search: z.string().trim().max(120).optional().describe("Free text matched against title, slug, department, location and sector."),
  trashed: z.boolean().default(false).describe("true lists jobs in the trash instead of live ones (restore with jobs_restore)."),
  includeStageCounts: z.boolean().default(false).describe("Add active-candidate counts per pipeline stage to every job."),
  limit: z.number().int().min(1).max(100).default(25).describe("Page size, max 100."),
  offset: z.number().int().min(0).default(0).describe("Rows to skip, for pagination."),
});

const jobsList = defineMcpTool({
  name: "jobs_list",
  title: "List jobs",
  description:
    "Search and filter the jobs you can see (newest first). Returns id, title, status, department, location, applicant counts (total, active, new this week), a risk flag for open jobs with no recent applications, and dashboard + public URLs. Use it first to find a jobId for the other jobs_* tools. Set includeStageCounts for a per-stage breakdown. Response includes total for pagination.",
  group: "jobs",
  scope: "jobs:read",
  permission: "jobs:view",
  annotations: READ,
  input: listInput,
  async run(input, ctx) {
    const workspace = (await getWorkspaceContext()).organization;
    const { rows, total } = await guard(() =>
      listJobsPage({
        status: input.status,
        department: input.department,
        location: input.location,
        search: input.search,
        trashed: input.trashed,
        limit: clampLimit(input.limit),
        offset: input.offset,
      }),
    );
    const stageCounts = input.includeStageCounts ? await activeCountsByStage(rows.map((row) => row.id)) : null;
    const now = new Date();
    return {
      total,
      count: rows.length,
      offset: input.offset,
      nextOffset: input.offset + rows.length < total ? input.offset + rows.length : null,
      jobs: rows.map((row) => ({
        ...serializeJobListRow(row, { origin: ctx.appOrigin, workspaceSlug: workspace.slug }, now),
        ...(stageCounts
          ? { stages: (stageCounts.get(row.id) ?? []).map((s) => ({ stageId: s.stageId, name: s.name, activeCandidates: s.count })) }
          : {}),
      })),
    };
  },
});

const jobsGet = defineMcpTool({
  name: "jobs_get",
  title: "Get job details",
  description:
    "Full detail of one job: description (HTML) and content sections, requirements/benefits, salary, location, workplace and employment type, status and publication dates, hiring team (with roles), ordered pipeline stages with ids and candidate counts, application-form fields and screening questions, any pending approval request, and the public/apply URLs (null unless the job is publicly visible). Needs jobId from jobs_list.",
  group: "jobs",
  scope: "jobs:read",
  permission: "jobs:view",
  annotations: READ,
  input: z.object({ jobId: jobIdField }),
  async run({ jobId }, ctx) {
    const detail = await loadJob(jobId);
    const [stages, hiringTeam, pending] = await Promise.all([
      loadStages(jobId),
      guard(() => loadHiringTeam(jobId)),
      guard(() => getPendingJobApproval(jobId)),
    ]);
    const base = { origin: ctx.appOrigin, workspaceSlug: detail.workspace.slug };
    return {
      job: serializeJobDetail(detail.job, base),
      stages: stages.map(serializeStage),
      hiringTeam,
      pendingApproval: pending
        ? {
            requestId: pending.id,
            requesterId: pending.requesterId,
            approverId: pending.approverId,
            requestedAt: pending.createdAt.toISOString(),
          }
        : null,
      applicationForm: serializeApplicationForm(jobToFormValues(detail.job).applicationConfig),
    };
  },
});

const pipelineOverview = defineMcpTool({
  name: "jobs_pipeline_overview",
  title: "Job pipeline overview",
  description:
    "Pipeline health. With jobId: for that job, active candidates per stage with average and maximum days in the current stage and how many are stalled (stuck at least staleDays), application totals by status, new applications this week and an at-risk flag. Without jobId: every open job you can see with its per-stage active counts and risk flag, to spot where to act. For moving candidates use the applications/pipeline tools.",
  group: "jobs",
  scope: "jobs:read",
  permission: "jobs:view",
  annotations: READ,
  input: z.object({
    jobId: z.uuid().optional().describe("Job id. Omit for an overview of all open jobs."),
    staleDays: z.number().int().min(1).max(365).default(7).describe("A candidate counts as stalled after this many days in the same stage."),
    limit: z.number().int().min(1).max(100).default(25).describe("Open jobs to include when jobId is omitted."),
    offset: z.number().int().min(0).default(0).describe("Pagination offset when jobId is omitted."),
  }),
  async run(input, ctx) {
    const workspaceSlug = (await getWorkspaceContext()).organization.slug;
    const now = new Date();
    if (!input.jobId) {
      const { rows, total } = await guard(() =>
        listJobsPage({ status: "open", limit: clampLimit(input.limit), offset: input.offset }),
      );
      const counts = await activeCountsByStage(rows.map((row) => row.id));
      return {
        total,
        offset: input.offset,
        nextOffset: input.offset + rows.length < total ? input.offset + rows.length : null,
        jobs: rows.map((row) => ({
          ...serializeJobListRow(row, { origin: ctx.appOrigin, workspaceSlug }, now),
          stages: (counts.get(row.id) ?? []).map((s) => ({ stageId: s.stageId, name: s.name, activeCandidates: s.count })),
        })),
      };
    }

    const detail = await loadJob(input.jobId);
    const [stages, aging, activity] = await Promise.all([
      loadStages(input.jobId),
      guard(() => stageAgingForJob(input.jobId!, input.staleDays)),
      guard(() => applicationActivity(input.jobId!)),
    ]);
    const agingByStage = new Map(aging.map((row) => [row.stageId, row]));
    const totalApplications = Object.values(activity.byStatus).reduce((sum, n) => sum + n, 0);
    return {
      job: {
        id: detail.job.id,
        title: detail.job.title,
        status: detail.job.status,
        url: dashboardJobUrl(ctx.appOrigin, detail.job.id),
      },
      totals: {
        applications: totalApplications,
        byStatus: activity.byStatus,
        newThisWeek: activity.newThisWeek,
        lastApplicationAt: activity.lastAppliedAt?.toISOString() ?? null,
        stalled: aging.reduce((sum, row) => sum + row.stalled, 0),
        staleDays: input.staleDays,
      },
      risk: jobRisk(
        {
          status: detail.job.status,
          applicants: totalApplications,
          lastAppliedAt: activity.lastAppliedAt,
          publishedAt: detail.job.publishedAt,
          createdAt: detail.job.createdAt,
        },
        now,
      ),
      stages: stages.map((stage) => {
        const stats = agingByStage.get(stage.id);
        return {
          stageId: stage.id,
          name: stage.name,
          kind: stage.kind,
          order: stage.order,
          activeCandidates: stats?.active ?? 0,
          avgDaysInStage: stats?.avgDaysInStage ?? 0,
          maxDaysInStage: stats?.maxDaysInStage ?? 0,
          stalled: stats?.stalled ?? 0,
        };
      }),
    };
  },
});

const jobsAtRisk = defineMcpTool({
  name: "jobs_at_risk",
  title: "Jobs at risk",
  description:
    "Open jobs that need attention because they have had no applications for 7+ days (after being live for a week), with the reason and severity. Use for 'which roles are not working'. Follow up with jobs_pipeline_overview or jobs_get on a jobId.",
  group: "jobs",
  scope: "jobs:read",
  permission: "jobs:view",
  annotations: READ,
  input: z.object({}),
  async run(_input, ctx) {
    const workspaceSlug = (await getWorkspaceContext()).organization.slug;
    const now = new Date();
    const found: ReturnType<typeof serializeJobListRow>[] = [];
    // Open jobs are few; read up to 500 of them in pages of 100.
    for (let offset = 0; offset < 500; offset += 100) {
      const { rows, total } = await guard(() => listJobsPage({ status: "open", limit: 100, offset }));
      for (const row of rows) {
        const serialized = serializeJobListRow(row, { origin: ctx.appOrigin, workspaceSlug }, now);
        if (serialized.risk) found.push(serialized);
      }
      if (offset + rows.length >= total) break;
    }
    return { count: found.length, jobs: found };
  },
});

const jobsListDepartments = defineMcpTool({
  name: "jobs_list_departments",
  title: "List departments",
  description: "Distinct department names used by the jobs you can see. Use these exact values for the department filter in jobs_list and the department field of jobs_create / jobs_update.",
  group: "jobs",
  scope: "jobs:read",
  permission: "jobs:view",
  annotations: READ,
  input: z.object({}),
  async run() {
    const departments = await guard(() => listWorkspaceDepartments());
    return { count: departments.length, departments };
  },
});

const jobsListMembers = defineMcpTool({
  name: "jobs_list_assignable_members",
  title: "List workspace members",
  description: "Active workspace members (userId, name, email) who can be added to a job's hiring team or chosen as the approver of a job. Returns userIds for jobs_set_hiring_team_member and jobs_request_approval.",
  group: "jobs",
  scope: "jobs:read",
  permission: "hiring_team:manage",
  annotations: READ,
  input: z.object({}),
  async run() {
    const members = await guard(() => listWorkspaceMembers());
    return { count: members.length, members: members.map((m) => ({ userId: m.userId, name: m.name, email: m.email })) };
  },
});

const careerPageGet = defineMcpTool({
  name: "jobs_get_career_page",
  title: "Get career page settings",
  description: "Read-only summary of the public career page / job board: board URL, whether a custom template is chosen (and which), headline and subhead, optional sections, SEO indexing, and how many open jobs you can see. Job-level public links come from jobs_get / jobs_list. Editing the career page is a settings tool, not a jobs tool.",
  group: "jobs",
  scope: "jobs:read",
  permission: "jobs:view",
  annotations: READ,
  input: z.object({}),
  async run(_input, ctx) {
    const { organization } = await getWorkspaceContext();
    const config = normalizeCareerPageConfig(await guard(() => getCareerPageSettings(organization.id)));
    const open = await guard(() => listJobsPage({ status: "open", limit: 1, offset: 0 }));
    return {
      boardUrl: boardUrl(ctx.appOrigin, organization.slug),
      customized: isCareerPageConfigured(config),
      template: config.template || null,
      headline: config.hero.headline,
      subhead: config.hero.subhead,
      intro: config.intro.body,
      sections: { values: config.values.enabled, faq: config.faq.enabled },
      seo: {
        indexable: config.seo.indexable,
        title: config.seo.title || null,
        description: config.seo.description || null,
      },
      openJobs: open.total,
    };
  },
});

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

const createInput = z.object({
  title: z.string().trim().min(3).max(200).describe("Job title, at least 3 characters."),
  ...jobFieldsShape,
});

const jobsCreate = defineMcpTool({
  name: "jobs_create",
  title: "Create a job (draft)",
  description:
    "Create a new job as a DRAFT with the default pipeline stages; you become its recruiter. Needs a title plus either a description or at least one content section. employmentType defaults to full_time and workplaceType to onsite. The job is not public until you call jobs_publish (or the approval flow completes). Use jobs_generate_description first if you need AI wording. Returns the new job and its dashboard URL. Not idempotent: calling twice creates two jobs.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:create",
  annotations: WRITE_ONCE,
  input: createInput,
  async run(input, ctx) {
    const context = await guard(() => requirePermission("jobs:create"));
    const values = mergeJobValues(newJobBase(input.title.trim()), input as JobFieldsPatch);
    assertValidJobValues(values);
    await assertCanCreateInScope(values.department);
    const job = await guard(() => createJob(values));
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "job.created",
      resourceType: "job",
      resourceId: job.id,
      severity: "info",
      metadata: { title: job.title, slug: job.slug, source: "mcp" },
    });
    revalidatePath("/dashboard/jobs");
    return {
      job: serializeJobDetail(job, { origin: ctx.appOrigin, workspaceSlug: context.organization.slug }),
      note: "Created as a draft. Publish it with jobs_publish when it is ready.",
    };
  },
});

const jobsUpdate = defineMcpTool({
  name: "jobs_update",
  title: "Update a job",
  description:
    "Edit fields of an existing job; only the fields you pass change. Pass null to clear an optional field (department, location, salary, ...). description and contentSections replace the existing text, so read jobs_get first when editing wording. The slug (public URL) stays the same unless you pass a new one. Does not change status (use jobs_publish / jobs_unpublish / jobs_close), the pipeline (jobs_*_stage) or the application form (jobs_update_application_form).",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:edit",
  annotations: WRITE_IDEMPOTENT,
  input: z.object({
    jobId: jobIdField,
    title: z.string().trim().min(3).max(200).optional().describe("New job title."),
    ...jobFieldsShape,
  }),
  async run(input, ctx) {
    const { jobId, ...patch } = input;
    if (Object.values(patch).every((value) => value === undefined)) {
      throw new McpToolError("Pass at least one field to change.", "invalid_input");
    }
    const { job, workspaceSlug } = await saveJobEdits(jobId, (current) => mergeJobValues(current, patch as JobFieldsPatch));
    return { job: serializeJobDetail(job, { origin: ctx.appOrigin, workspaceSlug }) };
  },
});

const jobsDuplicate = defineMcpTool({
  name: "jobs_duplicate",
  title: "Duplicate a job",
  description:
    "Create a new DRAFT job by copying an existing one's content: title (suffixed ' (copy)' unless you give one), description, sections, salary, location, keywords and application form. Candidates, custom stages and the hiring team are not copied (the new job gets the default stages and you as recruiter). Not idempotent. Returns the new job.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:create",
  annotations: WRITE_ONCE,
  input: z.object({
    jobId: jobIdField.describe("Job to copy."),
    title: z.string().trim().min(3).max(200).optional().describe("Title of the copy. Defaults to '<original> (copy)'."),
  }),
  async run(input, ctx) {
    const context = await guard(() => requirePermission("jobs:create"));
    const source = await loadJob(input.jobId);
    const values = {
      ...jobToFormValues(source.job),
      title: input.title?.trim() || `${source.job.title} (copy)`.slice(0, 200),
      slug: undefined,
      validThrough: undefined,
    };
    await assertCanCreateInScope(values.department);
    const job = await guard(() => createJob(values));
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "job.created",
      resourceType: "job",
      resourceId: job.id,
      severity: "info",
      metadata: { title: job.title, slug: job.slug, source: "mcp", duplicatedFrom: source.job.id },
    });
    revalidatePath("/dashboard/jobs");
    return { job: serializeJobDetail(job, { origin: ctx.appOrigin, workspaceSlug: context.organization.slug }) };
  },
});

// ---------------------------------------------------------------------------
// Application form
// ---------------------------------------------------------------------------

const jobsGetApplicationForm = defineMcpTool({
  name: "jobs_get_application_form",
  title: "Get application form",
  description: "The candidate-facing application form of a job: visibility (required / optional / disabled) of phone, address, photo, headline, resume, LinkedIn, GitHub, website, education, experience and cover letter, plus the custom screening questions (id, label, type, required, options). Needs jobId.",
  group: "jobs",
  scope: "jobs:read",
  permission: "jobs:view",
  annotations: READ,
  input: z.object({ jobId: jobIdField }),
  async run({ jobId }) {
    const detail = await loadJob(jobId);
    return { jobId, title: detail.job.title, ...serializeApplicationForm(jobToFormValues(detail.job).applicationConfig) };
  },
});

const jobsUpdateApplicationForm = defineMcpTool({
  name: "jobs_update_application_form",
  title: "Update application form",
  description:
    "Change which fields the application form asks for and/or replace its screening questions. fields is a partial map; only listed fields change. questions, when passed, REPLACES the whole list (max 10): include the ones you want to keep (reuse their id so past answers stay linked). Question types: text, textarea, url, select (options required), info (description required), consent (description required). Changes apply to new applications only.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:edit",
  annotations: WRITE_IDEMPOTENT,
  input: z.object({
    jobId: jobIdField,
    fields: z
      .object(
        Object.fromEntries(
          applicationFieldKeys.map((key) => [key, z.enum(FIELD_VISIBILITY).optional().describe(`Visibility of the ${key} field.`)]),
        ) as Record<(typeof applicationFieldKeys)[number], z.ZodOptional<z.ZodEnum<{ required: "required"; optional: "optional"; disabled: "disabled" }>>>,
      )
      .optional()
      .describe("Partial map of field name to required | optional | disabled."),
    questions: z.array(questionInputSchema).max(10).optional().describe("Complete replacement list of screening questions."),
  }),
  async run(input) {
    if (!input.fields && !input.questions) {
      throw new McpToolError("Pass fields and/or questions.", "invalid_input");
    }
    const questions = input.questions ? buildQuestions(input.questions) : undefined;
    const { job } = await saveJobEdits(input.jobId, (current) => ({
      ...current,
      applicationConfig: applyApplicationFormPatch(current.applicationConfig, {
        fields: input.fields,
        questions,
      }),
    }));
    return { jobId: job.id, ...serializeApplicationForm(jobToFormValues(job).applicationConfig) };
  },
});

// ---------------------------------------------------------------------------
// Status / approvals
// ---------------------------------------------------------------------------

const statusInput = z.object({ jobId: jobIdField });

const jobsPublish = defineMcpTool({
  name: "jobs_publish",
  title: "Publish or reopen a job",
  description:
    "Make a draft or closed job live on the public career page and job board (this is how you reopen a closed job). Needs the jobs:publish permission. Fails if the job has a pending approval request: resolve it with jobs_decide_approval first. Already-open jobs are left untouched (changed:false). Returns the status and the public + apply URLs.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:publish",
  annotations: { ...WRITE_IDEMPOTENT, openWorldHint: true },
  input: statusInput,
  run: ({ jobId }, ctx) => changeStatus(jobId, "open", ctx),
});

const jobsUnpublish = defineMcpTool({
  name: "jobs_unpublish",
  title: "Unpublish a job",
  description: "Take a job off the public career page and return it to draft. Existing applications and candidates are kept. Use jobs_close instead when hiring for the role is finished.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:edit",
  annotations: WRITE_IDEMPOTENT,
  input: statusInput,
  run: ({ jobId }, ctx) => changeStatus(jobId, "draft", ctx),
});

const jobsClose = defineMcpTool({
  name: "jobs_close",
  title: "Close a job",
  description: "Close a job: it disappears from the public career page and stops accepting applications, while existing applications stay in the pipeline. Reopen later with jobs_publish.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:edit",
  annotations: WRITE_IDEMPOTENT,
  input: statusInput,
  run: ({ jobId }, ctx) => changeStatus(jobId, "closed", ctx),
});

const jobsRequestApproval = defineMcpTool({
  name: "jobs_request_approval",
  title: "Request job approval",
  description:
    "Ask a colleague to approve a DRAFT job before it is published. approverId must be someone else (use jobs_list_assignable_members). The approver and workspace owners/admins are notified. While a request is pending the job cannot be published directly. If one is already pending it is returned unchanged.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:approve",
  annotations: WRITE_IDEMPOTENT,
  input: z.object({
    jobId: jobIdField,
    approverId: z.string().min(1).describe("userId of the approver (not yourself). From jobs_list_assignable_members."),
  }),
  async run(input) {
    const request = await guard(() => requestJobApproval({ jobId: input.jobId, approverId: input.approverId }));
    return {
      requestId: request.id,
      jobId: request.jobId,
      status: request.status,
      requesterId: request.requesterId,
      approverId: request.approverId,
      requestedAt: request.createdAt.toISOString(),
    };
  },
});

const jobsListMyApprovals = defineMcpTool({
  name: "jobs_list_my_approvals",
  title: "List my pending approvals",
  description: "Job approval requests waiting for YOUR decision (oldest first): requestId, job, who asked and when. Decide them with jobs_decide_approval.",
  group: "jobs",
  scope: "jobs:read",
  permission: "jobs:approve",
  annotations: READ,
  input: z.object({}),
  async run(_input, ctx) {
    const rows = await guard(() => listPendingApprovalsForMe());
    return {
      count: rows.length,
      approvals: rows.map((row) => ({
        requestId: row.requestId,
        jobId: row.jobId,
        jobTitle: row.jobTitle,
        requestedBy: { userId: row.requesterId, name: row.requesterName },
        requestedAt: row.createdAt.toISOString(),
        url: dashboardJobUrl(ctx.appOrigin, row.jobId),
      })),
    };
  },
});

const jobsDecideApproval = defineMcpTool({
  name: "jobs_decide_approval",
  title: "Approve or reject a job",
  description:
    "Decide a pending job approval request that is assigned to you. Approving PUBLISHES the job immediately (it goes live on the career page); rejecting leaves it a draft. Identify the request by requestId (from jobs_list_my_approvals / jobs_get) or by jobId. Only the assigned approver can decide, and a request can be decided once. The requester and admins are notified.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:approve",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  input: z.object({
    requestId: z.uuid().optional().describe("Approval request id."),
    jobId: z.uuid().optional().describe("Alternative to requestId: the job whose pending request you are deciding."),
    decision: z.enum(["approved", "rejected"]).describe("approved publishes the job; rejected leaves it as a draft."),
    comment: z.string().trim().max(2000).optional().describe("Optional note shown to the requester."),
  }),
  async run(input) {
    let requestId = input.requestId;
    if (!requestId) {
      if (!input.jobId) throw new McpToolError("Pass requestId or jobId.", "invalid_input");
      await loadJob(input.jobId);
      const pending = await guard(() => getPendingJobApproval(input.jobId!));
      if (!pending) throw new McpToolError("This job has no pending approval request.", "not_found");
      requestId = pending.id;
    }
    const decided = await guard(() =>
      decideJobApproval({ requestId: requestId!, decision: input.decision, comment: input.comment }),
    );
    return {
      requestId: decided.id,
      jobId: decided.jobId,
      status: decided.status,
      decidedAt: decided.decidedAt?.toISOString() ?? null,
      published: input.decision === "approved",
    };
  },
});

// ---------------------------------------------------------------------------
// Hiring team
// ---------------------------------------------------------------------------

const jobsSetTeamMember = defineMcpTool({
  name: "jobs_set_hiring_team_member",
  title: "Add or change hiring team member",
  description:
    "Add a workspace member to a job's hiring team with a role (recruiter, hiring_manager or interviewer), or change their role if already on it. Team membership also controls who can see the job when a role is limited to assigned jobs. Needs hiring_team:manage. Get userIds from jobs_list_assignable_members. Returns the updated team.",
  group: "jobs",
  scope: "jobs:write",
  permission: "hiring_team:manage",
  annotations: WRITE_IDEMPOTENT,
  input: z.object({
    jobId: jobIdField,
    userId: z.string().min(1).describe("userId of a workspace member."),
    role: z.enum(HIRING_TEAM_ROLES).describe("recruiter, hiring_manager or interviewer."),
  }),
  async run(input) {
    await guard(() => requireJobPermission("hiring_team:manage", input.jobId));
    const team = await loadHiringTeam(input.jobId);
    const existing = team.find((member) => member.userId === input.userId);
    if (!existing) {
      const result = await addHiringTeamMember({ jobId: input.jobId, userId: input.userId, role: input.role });
      if (!result.success) failure(result.error, "Unable to add member.");
    } else if (existing.role !== input.role) {
      const result = await updateHiringTeamRole({ id: existing.memberId, jobId: input.jobId, role: input.role });
      if (!result.success) failure(result.error, "Unable to update role.");
    }
    return { jobId: input.jobId, hiringTeam: await loadHiringTeam(input.jobId) };
  },
});

const jobsRemoveTeamMember = defineMcpTool({
  name: "jobs_remove_hiring_team_member",
  title: "Remove hiring team member",
  description: "Remove a person from a job's hiring team. They lose job-scoped access if their role is limited to assigned jobs. Needs hiring_team:manage. Removing someone who is not on the team succeeds with removed:false. Returns the remaining team.",
  group: "jobs",
  scope: "jobs:write",
  permission: "hiring_team:manage",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  input: z.object({ jobId: jobIdField, userId: z.string().min(1).describe("userId of the team member to remove.") }),
  async run(input) {
    await guard(() => requireJobPermission("hiring_team:manage", input.jobId));
    const team = await loadHiringTeam(input.jobId);
    const existing = team.find((member) => member.userId === input.userId);
    if (!existing) return { jobId: input.jobId, removed: false, hiringTeam: team };
    const result = await removeHiringTeamMember({ id: existing.memberId, jobId: input.jobId });
    if (!result.success) failure(result.error, "Unable to remove member.");
    return { jobId: input.jobId, removed: true, hiringTeam: await loadHiringTeam(input.jobId) };
  },
});

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

const stageKind = jobStageKindSchema
  .optional()
  .describe(
    "Meaning of the stage: applied, screening, interview, offer, hired, rejected, withdrawn or custom. Drives automations and reports; the name is cosmetic.",
  );

const jobsListStages = defineMcpTool({
  name: "jobs_list_stages",
  title: "List pipeline stages",
  description: "Ordered pipeline stages of a job with id, name, kind, color, application count and whether candidate-update emails are on. Stage ids are needed to move candidates and by the other jobs_*_stage tools. includeArchived adds retired stages (after the live ones).",
  group: "jobs",
  scope: "jobs:read",
  permission: "jobs:view",
  annotations: READ,
  input: z.object({ jobId: jobIdField, includeArchived: z.boolean().default(false).describe("Also list archived stages.") }),
  async run(input) {
    const stages = await loadStages(input.jobId, input.includeArchived);
    return { jobId: input.jobId, stages: stages.map(serializeStage) };
  },
});

const jobsCreateStage = defineMcpTool({
  name: "jobs_create_stage",
  title: "Add a pipeline stage",
  description: "Add a stage to a job's pipeline. Without position it lands before the first terminal stage (hired / rejected / withdrawn), so new applicants can still enter. Stage names must be unique within the job. Not idempotent.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:edit",
  annotations: WRITE_ONCE,
  input: z.object({
    jobId: jobIdField,
    name: z.string().trim().min(1).max(120).describe("Stage name, unique within the job."),
    color: z.string().trim().max(32).nullish().describe("Optional color token or hex."),
    kind: stageKind,
    position: z.number().int().nonnegative().optional().describe("0-based index among the job's active stages."),
  }),
  async run(input) {
    const result = await createJobStageAction(input);
    if (!result.success) failure(result.error, "Could not add the stage.");
    return { stage: serializeStage(result.stage) };
  },
});

const jobsUpdateStage = defineMcpTool({
  name: "jobs_update_stage",
  title: "Update a pipeline stage",
  description: "Rename a stage, change its color or kind, or turn the automatic candidate-update emails for that stage on or off. Only passed fields change. Position is changed with jobs_reorder_stages.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:edit",
  annotations: WRITE_IDEMPOTENT,
  input: z.object({
    jobId: jobIdField,
    stageId: z.uuid().describe("Stage id from jobs_list_stages."),
    name: z.string().trim().min(1).max(120).optional().describe("New name, unique within the job."),
    color: z.string().trim().max(32).nullish().describe("New color; null clears it."),
    kind: stageKind,
    candidateUpdateEmailsEnabled: z.boolean().optional().describe("Send candidates an automatic email when they enter this stage."),
  }),
  async run(input) {
    const { candidateUpdateEmailsEnabled, ...rest } = input;
    const result = await updateJobStageAction({
      ...rest,
      ...(candidateUpdateEmailsEnabled === undefined
        ? {}
        : { emailConfig: { candidateUpdatesEnabled: candidateUpdateEmailsEnabled } }),
    });
    if (!result.success) failure(result.error, "Could not update the stage.");
    return { stage: serializeStage(result.stage) };
  },
});

const jobsReorderStages = defineMcpTool({
  name: "jobs_reorder_stages",
  title: "Reorder pipeline stages",
  description: "Set the order of a job's active stages. stageIds must list every active stage exactly once, in the new left-to-right order (get them from jobs_list_stages). Returns the new order.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:edit",
  annotations: WRITE_IDEMPOTENT,
  input: z.object({
    jobId: jobIdField,
    stageIds: z.array(z.uuid()).min(1).max(100).describe("All active stage ids in the desired order."),
  }),
  async run(input) {
    const result = await reorderJobStagesAction(input);
    if (!result.success) failure(result.error, "Could not reorder the stages.");
    return { jobId: input.jobId, stages: result.stages.map(serializeStage) };
  },
});

const jobsArchiveStage = defineMcpTool({
  name: "jobs_archive_stage",
  title: "Archive a pipeline stage",
  description: "Retire a stage: it disappears from the board and pickers but keeps its history. If it still holds candidates, pass mergeIntoStageId to move them to another active stage of the same job (otherwise archiving a non-empty stage is refused). Cannot be undone from here.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:edit",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  input: z.object({
    jobId: jobIdField,
    stageId: z.uuid().describe("Stage to archive."),
    mergeIntoStageId: z.uuid().nullish().describe("Active stage that receives the candidates currently in this stage."),
  }),
  async run(input) {
    const result = await archiveJobStageAction(input);
    if (!result.success) failure(result.error, "Could not archive the stage.");
    return { stage: serializeStage(result.stage), movedApplications: result.movedApplications };
  },
});

// ---------------------------------------------------------------------------
// Trash
// ---------------------------------------------------------------------------

const jobsTrash = defineMcpTool({
  name: "jobs_trash",
  title: "Move a job to the trash",
  description: "Soft-delete a job: it leaves the job list and the public career page but nothing is erased, and jobs_restore brings it back. Applications and candidates are kept. There is no tool for permanent deletion.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:delete",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  input: z.object({ jobId: jobIdField }),
  async run({ jobId }) {
    const found = await loadJob(jobId);
    const result = await guard(() => trashJobAction(jobId));
    if (!result.success) failure(result.error, "Could not move the job to the trash.");
    return { jobId, title: found.job.title, trashed: true };
  },
});

const jobsRestore = defineMcpTool({
  name: "jobs_restore",
  title: "Restore a job from the trash",
  description: "Bring a trashed job back (find ids with jobs_list trashed:true). It returns with its previous status; a job that was open becomes public again.",
  group: "jobs",
  scope: "jobs:write",
  permission: "jobs:delete",
  annotations: WRITE_IDEMPOTENT,
  input: z.object({ jobId: jobIdField }),
  async run({ jobId }) {
    const result = await guard(() => restoreJobAction(jobId));
    if (!result.success) failure(result.error, "Could not restore the job.");
    return { jobId, restored: true };
  },
});

// ---------------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------------

const jobsGenerateDescription = defineMcpTool({
  name: "jobs_generate_description",
  title: "Draft a job description with AI",
  description: "Use the workspace's configured AI provider to draft a job description (summary + sections of bullets) in the company's voice. Nothing is saved: pass descriptionHtml as `description` to jobs_create or jobs_update after reviewing it. Fails with 'unavailable' when AI is not enabled for the workspace.",
  group: "jobs",
  scope: "jobs:read",
  permission: "jobs:create",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  input: z.object({
    title: z.string().trim().min(3).max(200).describe("Job title to write for."),
    department: z.string().trim().max(120).optional().describe("Department, for context."),
    workplaceType: z.enum(WORKPLACE_TYPES).optional().describe("remote, hybrid or onsite."),
    keywords: z.array(z.string().trim().min(1).max(80)).max(30).optional().describe("Skills / themes to emphasise."),
  }),
  async run(input) {
    const result = await guard(() => generateJobDraftAction(input));
    if (!result.ok) {
      throw new McpToolError(result.error, /enable ai/i.test(result.error) ? "unavailable" : "invalid_input");
    }
    return { summary: result.draft.summary, sections: result.draft.sections, descriptionHtml: draftToHtml(result.draft) };
  },
});

const jobsGenerateQuestions = defineMcpTool({
  name: "jobs_generate_screening_questions",
  title: "Draft screening questions with AI",
  description: "Use the workspace's AI provider to suggest screening questions for a role. Nothing is saved: review them and pass the ones you want to jobs_update_application_form (questions replaces the list). Fails with 'unavailable' when AI is not enabled.",
  group: "jobs",
  scope: "jobs:read",
  permission: "jobs:create",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  input: z.object({
    title: z.string().trim().min(3).max(200).describe("Job title."),
    description: z.string().max(20_000).optional().describe("Job description for context."),
    requirements: z.string().max(20_000).optional().describe("Requirements text for context."),
    keywords: z.array(z.string().trim().min(1).max(80)).max(30).optional().describe("Skills / themes."),
  }),
  async run(input) {
    const result = await guard(() => generateScreeningQuestionsAction(input));
    if (!result.ok) {
      throw new McpToolError(result.error, result.reason === "not_configured" ? "unavailable" : "invalid_input");
    }
    return { questions: result.questions };
  },
});

export const jobsTools: McpToolDefinition[] = [
  jobsList,
  jobsGet,
  pipelineOverview,
  jobsAtRisk,
  jobsListDepartments,
  jobsListMembers,
  careerPageGet,
  jobsCreate,
  jobsUpdate,
  jobsDuplicate,
  jobsGetApplicationForm,
  jobsUpdateApplicationForm,
  jobsPublish,
  jobsUnpublish,
  jobsClose,
  jobsRequestApproval,
  jobsListMyApprovals,
  jobsDecideApproval,
  jobsSetTeamMember,
  jobsRemoveTeamMember,
  jobsListStages,
  jobsCreateStage,
  jobsUpdateStage,
  jobsReorderStages,
  jobsArchiveStage,
  jobsTrash,
  jobsRestore,
  jobsGenerateDescription,
  jobsGenerateQuestions,
];
