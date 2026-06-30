import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";

import { aiEvaluations, db } from "@harly/db";

import {
  getPipelineOverview,
  getCandidatesNeedingReview,
  getJobsAtRisk,
  getHiringPerformance,
  getTodayInterviews,
  getInbox,
} from "@/features/dashboard/widgets";
import { searchWorkspace } from "@/features/search/data";
import { listCandidates, getCandidateProfile } from "@/features/candidates/data";
import { listJobsWithStats, getDashboardJob } from "@/features/jobs/data";
import { listUpcomingInterviews } from "@/features/interviews/data";
import { listTasks, getTaskCounts } from "@/features/tasks/data";
import { listOffersForCandidate } from "@/features/offers/data";
import { listPoolCandidates, getPoolStats } from "@/features/pool/data";
import { listEmailTemplates, getEmailTemplate } from "@/features/email-templates/data";
import { getReportsData } from "@/features/reports/data";
import {
  generateAiEvaluationAction,
  detectCandidateDuplicatesAction,
  bulkGenerateAiEvaluationsForJobAction,
} from "@/features/candidates/ai-actions";
import { generateEmailDraftAction } from "@/features/candidates/actions";
import {
  generateJobDraftAction,
  generateScreeningQuestionsAction,
} from "@/features/jobs/actions";
import {
  generateInterviewBriefAction,
  summarizeInterviewNotesAction,
} from "@/features/interviews/actions";

/**
 * Context the tools run under. The cached widget/data fns resolve the workspace
 * from the session themselves; workspaceId here is used for the direct queries
 * (scores) and as a guard.
 */
export type HarlyToolContext = {
  workspaceId: string;
  userId: string;
};

/** Cap a string field so large blobs don't blow up the model context. */
function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Strip HTML to compact plain text for prompt-bound fields. */
function plain(html: string | null | undefined, max = 2000): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clip(text, max);
}

/**
 * Build the Harly AI READ tool set for a request.
 *
 * Every tool wraps an existing data/widget function (already workspace-scoped)
 * and returns a compact, JSON-serializable summary. WRITE tools live in
 * `write-tools.ts` and are merged in `buildHarlyTools`.
 */
function buildReadTools(ctx: HarlyToolContext) {
  return {
    reviewPipeline: tool({
      description:
        "Get the live hiring pipeline for a job: stage names and how many active candidates sit in each. Omit jobId to use the busiest open job. Use for 'how's my pipeline', funnel, 'where are candidates' questions.",
      inputSchema: z.object({
        jobId: z
          .string()
          .nullable()
          .describe("Specific job id, or null for the busiest open job."),
      }),
      execute: async ({ jobId }) => {
        const overview = await getPipelineOverview(jobId ?? undefined);
        return {
          job: overview.selected,
          totalActive: overview.total,
          stages: overview.stages.map((s: { name: string; count: number }) => ({
            stage: s.name,
            count: s.count,
          })),
          openJobs: overview.jobs.map((j: { id: string; title: string }) => ({
            id: j.id,
            title: j.title,
          })),
        };
      },
    }),

    candidatesNeedingReview: tool({
      description:
        "List active candidates waiting on a review/decision, with how long they've waited. Use for 'who needs review', 'who's stuck', 'what should I look at'.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await getCandidatesNeedingReview();
        return {
          count: rows.length,
          candidates: rows.map(
            (r: {
              id: string;
              candidateId: string;
              name: string;
              avatarUrl: string | null;
              job: string;
              stage: string;
              action: string;
              ageDays: number;
            }) => ({
              applicationId: r.id,
              candidateId: r.candidateId,
              name: r.name,
              avatarUrl: r.avatarUrl,
              job: r.job,
              stage: r.stage,
              action: r.action,
              waitingDays: r.ageDays,
            }),
          ),
        };
      },
    }),

    jobsAtRisk: tool({
      description:
        "List open jobs needing attention (no applicants, stalled, low conversion) with the reason. Use for 'which jobs are at risk', 'what's not working'.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await getJobsAtRisk();
        return { count: rows.length, jobs: rows };
      },
    }),

    hiringReport: tool({
      description:
        "Get hiring KPIs over the recent period: applications, interviews, hires, offer acceptance, each with % change vs the prior period. Use for 'how are we doing', metrics, trends.",
      inputSchema: z.object({}),
      execute: async () => {
        const perf = await getHiringPerformance();
        return { range: perf.rangeLabel, metrics: perf.metrics };
      },
    }),

    searchCandidates: tool({
      description:
        "Search candidates and jobs by name, email, or title. Use to resolve a person/job the user names before reading details or proposing an action.",
      inputSchema: z.object({
        query: z.string().min(1).max(100).describe("Name, email, or job title."),
      }),
      execute: async ({ query }) => {
        const results = await searchWorkspace(query);
        return {
          candidates: results.candidates.slice(0, 10),
          jobs: results.jobs.slice(0, 10),
        };
      },
    }),

    listCandidates: tool({
      description:
        "List candidates in the workspace (most recent first) with their contact basics. Use for 'show me candidates', browsing, or counting. For one candidate's full history use candidateProfile.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(25)
          .describe("Max candidates to return."),
      }),
      execute: async ({ limit }) => {
        const rows = await listCandidates();
        return {
          total: rows.length,
          candidates: rows.slice(0, limit).map((r) => ({
            candidateId: r.id,
            name: r.fullName,
            avatarUrl: r.avatarUrl,
            email: r.email,
            location: r.location,
          })),
        };
      },
    }),

    candidateProfile: tool({
      description:
        "Get one candidate's full profile: contact info, applications + current stage, tags, scorecards, AI evaluations, and recent notes. Resolve candidateId via searchCandidates first. Use for 'tell me about X', 'what's the status of X'.",
      inputSchema: z.object({
        candidateId: z.string().describe("The candidate id."),
      }),
      execute: async ({ candidateId }) => {
        const profile = await getCandidateProfile(candidateId);
        if (!profile) return { found: false as const };
        const c = profile.candidate as Record<string, unknown>;
        return {
          found: true as const,
          candidateId: c.id as string,
          name: `${c.firstName as string} ${c.lastName as string}`,
          avatarUrl: (c.avatarUrl as string) ?? null,
          email: c.email as string,
          headline: (c.headline as string) ?? null,
          location: (c.location as string) ?? null,
          applications: profile.applications.map((a) => ({
            applicationId: a.id,
            jobId: a.jobId,
            job: a.jobTitle,
            stage: a.currentStageName,
            status: a.status,
          })),
          tags: profile.tags.map((t) => t.label),
          scorecards: profile.scorecards.map((s) => ({
            rating: s.rating,
            stage: s.stageName,
            comment: clip(s.comment, 280),
          })),
          aiEvaluations: profile.aiEvaluations.map((e) => ({
            applicationId: e.applicationId,
            score: e.score,
            recommendation: e.recommendation,
            summary: clip(e.summary, 400),
          })),
          recentNotes: profile.notes.slice(0, 5).map((n) => ({
            author: n.authorName,
            body: clip(n.body, 280),
          })),
        };
      },
    }),

    listJobs: tool({
      description:
        "List all jobs with applicant stats (total, active, new this week) and status. Use for 'show my jobs', 'which roles are open', job-level counts.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await listJobsWithStats();
        return {
          count: rows.length,
          jobs: rows.map((j) => ({
            id: j.id,
            title: j.title,
            department: j.department,
            status: j.status,
            applicants: j.applicants,
            activeApplicants: j.activeApplicants,
            newThisWeek: j.newApplicants,
          })),
        };
      },
    }),

    jobDetail: tool({
      description:
        "Get one job's details plus its pipeline stages (with stage ids, in order). REQUIRED before proposing a stage move — read the destination stage id from here. Resolve jobId via searchCandidates or listJobs.",
      inputSchema: z.object({
        jobId: z.string().describe("The job id."),
      }),
      execute: async ({ jobId }) => {
        const result = await getDashboardJob(jobId);
        if (!result) return { found: false as const };
        const job = result.job as Record<string, unknown>;
        return {
          found: true as const,
          id: job.id as string,
          title: job.title as string,
          status: job.status as string,
          department: (job.department as string) ?? null,
          location: (job.location as string) ?? null,
          description: plain(job.description as string, 1500),
          stages: result.stages.map(
            (s: { id: string; name: string; order: number }) => ({
              id: s.id,
              name: s.name,
              order: s.order,
            }),
          ),
        };
      },
    }),

    upcomingInterviews: tool({
      description:
        "List upcoming scheduled interviews (future), with candidate, job, type, and time. Use for 'what interviews are coming up', 'my schedule'.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await listUpcomingInterviews();
        return {
          count: rows.length,
          interviews: rows.slice(0, 20).map((r) => ({
            id: r.id,
            candidate: (r as { candidate?: string }).candidate ?? null,
            job: (r as { job?: string }).job ?? null,
            type: (r as { type?: string }).type ?? null,
            scheduledAt: (r as { scheduledAt?: Date | string }).scheduledAt ?? null,
          })),
        };
      },
    }),

    todayInterviews: tool({
      description:
        "List interviews scheduled for today, with candidate, job, type, time, and interviewer. Use for 'what's on today', 'today's interviews'.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await getTodayInterviews();
        return {
          count: rows.length,
          interviews: rows.map((r) => ({
            id: r.id,
            candidate: r.candidate,
            job: r.job,
            label: r.label,
            interviewer: r.interviewer,
            scheduledAt: r.scheduledAt,
          })),
        };
      },
    }),

    listTasks: tool({
      description:
        "List workspace tasks, optionally filtered by status. Returns title, status, priority, due date, owner, and any linked candidate/job. Use for 'what tasks are open', 'what's due', 'my to-dos'.",
      inputSchema: z.object({
        status: z
          .enum(["pending", "in_progress", "completed", "canceled"])
          .nullable()
          .describe("Filter by status, or null for all."),
      }),
      execute: async ({ status }) => {
        const rows = await listTasks(status ? { status } : undefined);
        return {
          count: rows.length,
          tasks: rows.slice(0, 30).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            owner: t.ownerName,
            candidate: t.candidateName,
            job: t.jobTitle,
          })),
        };
      },
    }),

    taskCounts: tool({
      description:
        "Get task counts by status (pending, in progress, completed, canceled). Use for 'how many tasks', task summaries.",
      inputSchema: z.object({}),
      execute: async () => {
        return await getTaskCounts();
      },
    }),

    inbox: tool({
      description:
        "Get the recruiter's action inbox: derived to-dos (feedback due, interviews to schedule, screens, approvals) with urgency. Use for 'what needs my attention', 'what should I do next'.",
      inputSchema: z.object({}),
      execute: async () => {
        const items = await getInbox();
        return {
          count: items.length,
          items: items.slice(0, 20),
        };
      },
    }),

    getCandidateScore: tool({
      description:
        "Read the latest AI fit evaluation for one application: score, recommendation, summary, strengths, gaps. Requires applicationId (resolve via searchCandidates / candidateProfile / candidatesNeedingReview first).",
      inputSchema: z.object({
        applicationId: z.string().describe("The application id."),
      }),
      execute: async ({ applicationId }) => {
        const [row] = await db
          .select({
            score: aiEvaluations.score,
            recommendation: aiEvaluations.recommendation,
            summary: aiEvaluations.summary,
            strengths: aiEvaluations.strengths,
            gaps: aiEvaluations.gaps,
            usedResume: aiEvaluations.usedResume,
          })
          .from(aiEvaluations)
          .where(
            and(
              eq(aiEvaluations.workspaceId, ctx.workspaceId),
              eq(aiEvaluations.applicationId, applicationId),
            ),
          )
          .orderBy(desc(aiEvaluations.updatedAt))
          .limit(1);

        if (!row) return { scored: false as const };
        return {
          scored: true as const,
          score: row.score,
          recommendation: row.recommendation,
          summary: clip(row.summary, 600),
          strengths: row.strengths,
          gaps: row.gaps,
          usedResume: row.usedResume,
        };
      },
    }),

    generateCandidateScore: tool({
      description:
        "Generate (or regenerate) the AI fit evaluation for one application, then return the result: score, recommendation, summary, strengths, gaps. This is how you 'review a CV' or 'evaluate' a candidate — it automatically reads the candidate's latest uploaded resume plus their application answers, scores the fit against the job, and gives the result in one step. Use this when getCandidateScore returns scored:false, or whenever the user asks you to review/assess/recommend on a candidate. Runs server-side immediately (no confirmation needed). Requires applicationId.",
      inputSchema: z.object({
        applicationId: z.string().describe("The application to evaluate."),
      }),
      execute: async ({ applicationId }) => {
        const res = await generateAiEvaluationAction({ applicationId });
        if (!res.success) {
          return {
            scored: false as const,
            error:
              res.reason === "not_configured"
                ? "AI scoring isn't configured for this workspace."
                : res.error,
          };
        }
        // Read back the row the action just upserted.
        const [row] = await db
          .select({
            score: aiEvaluations.score,
            recommendation: aiEvaluations.recommendation,
            summary: aiEvaluations.summary,
            strengths: aiEvaluations.strengths,
            gaps: aiEvaluations.gaps,
            usedResume: aiEvaluations.usedResume,
          })
          .from(aiEvaluations)
          .where(
            and(
              eq(aiEvaluations.workspaceId, ctx.workspaceId),
              eq(aiEvaluations.applicationId, applicationId),
            ),
          )
          .orderBy(desc(aiEvaluations.updatedAt))
          .limit(1);

        if (!row) return { scored: false as const, error: "Evaluation not found after generating." };
        return {
          scored: true as const,
          score: row.score,
          recommendation: row.recommendation,
          summary: clip(row.summary, 600),
          strengths: row.strengths,
          gaps: row.gaps,
          usedResume: row.usedResume,
        };
      },
    }),

    candidateScorecards: tool({
      description:
        "Read the hiring team's scorecards (manual evaluations) for one candidate: rating, stage, comment, author. Use for 'what did the team think of X', 'show me the feedback'. Resolve candidateId first.",
      inputSchema: z.object({
        candidateId: z.string().describe("The candidate id."),
      }),
      execute: async ({ candidateId }) => {
        const profile = await getCandidateProfile(candidateId);
        if (!profile) return { found: false as const };
        return {
          found: true as const,
          scorecards: profile.scorecards.map((s) => ({
            rating: s.rating,
            stage: s.stageName,
            author: s.authorName,
            comment: clip(s.comment, 400),
          })),
        };
      },
    }),

    listCandidateOffers: tool({
      description:
        "List offers for one candidate: title, status (draft/sent/accepted/declined/withdrawn), salary, equity, start date. Use for 'what offers does X have', 'offer status'. Resolve candidateId first.",
      inputSchema: z.object({
        candidateId: z.string().describe("The candidate id."),
      }),
      execute: async ({ candidateId }) => {
        const offers = await listOffersForCandidate(candidateId);
        return {
          count: offers.length,
          offers: offers.map((o) => ({
            offerId: o.id,
            applicationId: o.applicationId,
            job: o.jobTitle,
            status: o.status,
            title: o.title,
            salaryAmount: o.salaryAmount,
            currency: o.currency,
            salaryPeriod: o.salaryPeriod,
            equity: o.equity,
            startDate: o.startDate,
            expiresAt: o.expiresAt,
          })),
        };
      },
    }),

    talentPool: tool({
      description:
        "Browse the talent pool (candidates kept warm, not tied to an active application) with totals by source, optionally filtered by a search term. Use for 'who's in the talent pool', 'show me sourced candidates', pool size.",
      inputSchema: z.object({
        search: z
          .string()
          .nullable()
          .describe("Optional name/skill/headline search, or null for all."),
      }),
      execute: async ({ search }) => {
        const [candidates, stats] = await Promise.all([
          listPoolCandidates(search ? { search } : undefined),
          getPoolStats(),
        ]);
        return {
          total: stats.total,
          bySource: stats.bySource,
          candidates: candidates.slice(0, 20).map((c) => ({
            candidateId: c.candidateId,
            name: `${c.firstName} ${c.lastName}`,
            avatarUrl: c.avatarUrl,
            headline: c.headline,
            location: c.location,
            skills: c.skills.slice(0, 10),
            source: c.source,
          })),
        };
      },
    }),

    listEmailTemplates: tool({
      description:
        "List the workspace's saved email templates (name + subject). Use for 'what templates do we have', or to pick one before drafting a candidate email. Read the full body with emailTemplate.",
      inputSchema: z.object({}),
      execute: async () => {
        const templates = await listEmailTemplates();
        return {
          count: templates.length,
          templates: templates.map((t) => ({
            id: t.id,
            name: t.name,
            subject: t.subject,
          })),
        };
      },
    }),

    emailTemplate: tool({
      description:
        "Read one email template's full subject and body (may contain {{variables}}). Resolve templateId via listEmailTemplates first. Use to base a candidate message on a template.",
      inputSchema: z.object({
        templateId: z.string().describe("The template id."),
      }),
      execute: async ({ templateId }) => {
        const template = await getEmailTemplate(templateId);
        if (!template) return { found: false as const };
        return {
          found: true as const,
          name: template.name,
          subject: template.subject,
          body: clip(template.body, 4000),
        };
      },
    }),

    reportsOverview: tool({
      description:
        "Get the full recruiting analytics report: headline summary (open roles, total candidates, 90-day applications, hires, avg time-to-hire, offer acceptance), the hiring funnel with conversion %, candidate sources with conversion, and time-to-hire distribution. Use for deep analytics, 'show me the funnel', 'where do candidates drop off', 'time to hire', 'best sources'.",
      inputSchema: z.object({}),
      execute: async () => {
        const data = await getReportsData();
        return {
          summary: data.summary,
          funnel: data.funnel,
          sources: data.sources,
          timeToHire: data.timeToHire,
        };
      },
    }),

    draftCandidateEmail: tool({
      description:
        "Draft an email to a candidate with AI (does NOT send) — returns a subject + body you then show the user and, if they want, send via sendCandidateEmail. Pick the type that matches intent. Resolve candidateId first.",
      inputSchema: z.object({
        candidateId: z.string().describe("The candidate id."),
        type: z
          .enum(["screening", "interview_invite", "rejection", "offer", "followup"])
          .describe("The kind of email to draft."),
      }),
      execute: async ({ candidateId, type }) => {
        const res = await generateEmailDraftAction({ candidateId, type });
        if (!res.ok) {
          return { drafted: false as const, error: res.error };
        }
        return { drafted: true as const, subject: res.subject, body: res.body };
      },
    }),

    generateJobDraft: tool({
      description:
        "Generate an AI job description draft (summary + sections of bullets) for a role. Returns the draft for the user to review — does not create the job. Use for 'write a JD for X', 'draft a job post'.",
      inputSchema: z.object({
        title: z.string().describe("Job title."),
        department: z.string().nullable().describe("Department, or null."),
        workplaceType: z
          .enum(["remote", "hybrid", "onsite"])
          .nullable()
          .describe("Workplace type, or null."),
        keywords: z.array(z.string()).describe("Relevant skills/keywords (can be empty)."),
      }),
      execute: async ({ title, department, workplaceType, keywords }) => {
        const res = await generateJobDraftAction({
          title,
          department: department ?? undefined,
          workplaceType: workplaceType ?? undefined,
          keywords,
        });
        if (!res.ok) return { drafted: false as const, error: res.error };
        return { drafted: true as const, draft: res.draft };
      },
    }),

    generateScreeningQuestions: tool({
      description:
        "Generate AI screening questions for a role (label + input type). Returns suggestions for the user to review — does not save them. Use for 'suggest screening questions for X'.",
      inputSchema: z.object({
        title: z.string().describe("Job title."),
        description: z.string().nullable().describe("Job description, or null."),
        requirements: z.string().nullable().describe("Requirements, or null."),
        keywords: z.array(z.string()).describe("Relevant keywords (can be empty)."),
      }),
      execute: async ({ title, description, requirements, keywords }) => {
        const res = await generateScreeningQuestionsAction({
          title,
          description,
          requirements,
          keywords,
        });
        if (!res.ok) return { generated: false as const, error: res.error };
        return { generated: true as const, questions: res.questions };
      },
    }),

    interviewBrief: tool({
      description:
        "Generate (and persist) an AI pre-interview brief for a scheduled interview: candidate summary, key areas to probe, suggested questions, red flags. Use before an interview, for 'prep me for X's interview'. Resolve interviewId from upcomingInterviews/todayInterviews.",
      inputSchema: z.object({
        interviewId: z.string().describe("The interview id."),
      }),
      execute: async ({ interviewId }) => {
        const res = await generateInterviewBriefAction({ interviewId });
        if (!res.success) return { generated: false as const, error: res.error };
        return { generated: true as const, brief: res.brief };
      },
    }),

    summarizeInterviewNotes: tool({
      description:
        "Summarize raw post-interview notes into a structured AI read: executive summary, positive signals, concerns, and a suggested decision. The user provides the notes. Use for 'summarize my interview notes', 'what's the verdict from these notes'.",
      inputSchema: z.object({
        interviewId: z.string().describe("The interview id."),
        rawNotes: z.string().describe("The raw notes text to summarize."),
      }),
      execute: async ({ interviewId, rawNotes }) => {
        const res = await summarizeInterviewNotesAction({ interviewId, rawNotes });
        if (!res.success) return { summarized: false as const, error: res.error };
        return { summarized: true as const, summary: res.summary };
      },
    }),

    detectDuplicates: tool({
      description:
        "Find likely duplicate candidate records for one candidate (same person applied twice, etc.), with confidence + reason. Use for 'is X a duplicate', 'check for duplicates of X'. Resolve candidateId first.",
      inputSchema: z.object({
        candidateId: z.string().describe("The candidate id to check."),
      }),
      execute: async ({ candidateId }) => {
        const res = await detectCandidateDuplicatesAction({ candidateId });
        if (!res.ok) return { ok: false as const, error: res.error };
        return { ok: true as const, matches: res.matches };
      },
    }),

    compareCandidates: tool({
      description:
        "Compare two or more candidates side by side using their AI fit scores (score + recommendation + summary each). Use for 'compare X and Y', 'who's the stronger candidate'. Pass the applicationIds (resolve via candidateProfile/candidatesNeedingReview). Only candidates with a generated score are included; generate scores first if missing.",
      inputSchema: z.object({
        applicationIds: z
          .array(z.string())
          .min(2)
          .max(5)
          .describe("2–5 application ids to compare."),
      }),
      execute: async ({ applicationIds }) => {
        const rows = await db
          .select({
            applicationId: aiEvaluations.applicationId,
            candidateId: aiEvaluations.candidateId,
            score: aiEvaluations.score,
            recommendation: aiEvaluations.recommendation,
            summary: aiEvaluations.summary,
          })
          .from(aiEvaluations)
          .where(eq(aiEvaluations.workspaceId, ctx.workspaceId))
          .orderBy(desc(aiEvaluations.updatedAt));

        const byApp = new Map<string, (typeof rows)[number]>();
        for (const r of rows) {
          if (applicationIds.includes(r.applicationId) && !byApp.has(r.applicationId)) {
            byApp.set(r.applicationId, r);
          }
        }
        const scored = applicationIds
          .map((id) => byApp.get(id))
          .filter((r): r is (typeof rows)[number] => Boolean(r))
          .map((r) => ({
            applicationId: r.applicationId,
            candidateId: r.candidateId,
            score: r.score,
            recommendation: r.recommendation,
            summary: clip(r.summary, 300),
          }));
        const missing = applicationIds.filter((id) => !byApp.has(id));
        return { compared: scored, missingScores: missing };
      },
    }),

    bulkScoreJob: tool({
      description:
        "Generate AI fit scores for ALL not-yet-scored active applicants of a job, in one batch (server-side, no per-candidate confirmation). Use for 'score everyone for X', 'evaluate all applicants to this role'. Resolve jobId first. Returns how many succeeded/failed and how many remain (call again to continue if remaining > 0).",
      inputSchema: z.object({
        jobId: z.string().describe("The job whose applicants to score."),
      }),
      execute: async ({ jobId }) => {
        const res = await bulkGenerateAiEvaluationsForJobAction({ jobId });
        if (!res.success) {
          return { ok: false as const, error: res.error ?? "Bulk scoring failed." };
        }
        return {
          ok: true as const,
          succeeded: res.succeeded,
          failed: res.failed,
          remaining: res.remaining,
        };
      },
    }),
  };
}

export { buildReadTools };
