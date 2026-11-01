import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/jobs/actions", () => ({
  generateJobDraftAction: vi.fn(),
  generateScreeningQuestionsAction: vi.fn(),
  restoreJobAction: vi.fn(),
  trashJobAction: vi.fn(),
  updateJobStatusAction: vi.fn(),
}));
vi.mock("@/features/jobs/approval", () => ({
  decideJobApproval: vi.fn(),
  getPendingJobApproval: vi.fn(),
  requestJobApproval: vi.fn(),
}));
vi.mock("@/features/jobs/data", () => ({
  createJob: vi.fn(),
  getDashboardJob: vi.fn(),
  listWorkspaceDepartments: vi.fn(),
  updateJob: vi.fn(),
}));
vi.mock("@/features/jobs/hiring-team-actions", () => ({
  addHiringTeamMember: vi.fn(),
  removeHiringTeamMember: vi.fn(),
  updateHiringTeamRole: vi.fn(),
}));
vi.mock("@/features/jobs/hiring-team-data", () => ({
  listJobHiringTeam: vi.fn(),
  listWorkspaceMembers: vi.fn(),
}));
vi.mock("@/features/pipeline/stage-actions", () => ({
  archiveJobStageAction: vi.fn(),
  createJobStageAction: vi.fn(),
  listJobStagesAction: vi.fn(),
  reorderJobStagesAction: vi.fn(),
  updateJobStageAction: vi.fn(),
}));
vi.mock("@/features/search/scope", () => ({ isUnrestrictedScope: vi.fn(() => true) }));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: vi.fn() }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  getRolePolicy: vi.fn(),
  requireJobPermission: vi.fn(),
  requirePermission: vi.fn(),
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("./jobs/queries", () => ({
  activeCountsByStage: vi.fn(),
  applicationActivity: vi.fn(),
  getCareerPageSettings: vi.fn(),
  listJobsPage: vi.fn(),
  listPendingApprovalsForMe: vi.fn(),
  stageAgingForJob: vi.fn(),
}));

import { jobsTools } from "./jobs";
import {
  applyApplicationFormPatch,
  buildQuestions,
  classifyFailure,
  draftToHtml,
  jobRisk,
  mapActionError,
  mergeJobValues,
  newJobBase,
  publicJobLinks,
  textToHtml,
  validateJobValues,
} from "./jobs/helpers";
import { McpToolError } from "../types";

describe("jobs tool registry", () => {
  it("has unique snake_case names prefixed jobs_ and the jobs group", () => {
    const names = jobsTools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of jobsTools) {
      expect(tool.name).toMatch(/^jobs_[a-z_]+$/);
      expect(tool.group).toBe("jobs");
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  it("uses jobs scopes and explicit annotations; reads are read-only", () => {
    for (const tool of jobsTools) {
      expect(["jobs:read", "jobs:write"]).toContain(tool.scope);
      expect(Object.keys(tool.annotations).sort()).toEqual([
        "destructiveHint",
        "idempotentHint",
        "openWorldHint",
        "readOnlyHint",
      ]);
      if (tool.scope === "jobs:read") expect(tool.annotations.readOnlyHint).toBe(true);
      if (tool.annotations.readOnlyHint) expect(tool.annotations.destructiveHint).toBe(false);
      expect(tool.permission).not.toBeNull();
    }
  });

  it("marks trash, archive and decisions destructive and publish open-world", () => {
    const by = Object.fromEntries(jobsTools.map((t) => [t.name, t]));
    expect(by.jobs_trash.annotations.destructiveHint).toBe(true);
    expect(by.jobs_archive_stage.annotations.destructiveHint).toBe(true);
    expect(by.jobs_decide_approval.annotations.destructiveHint).toBe(true);
    expect(by.jobs_publish.annotations.openWorldHint).toBe(true);
    expect(by.jobs_publish.permission).toBe("jobs:publish");
    expect(by.jobs_set_hiring_team_member.permission).toBe("hiring_team:manage");
    expect(by.jobs_create.permission).toBe("jobs:create");
    expect(by.jobs_trash.permission).toBe("jobs:delete");
  });

  it("describes every input field", () => {
    for (const tool of jobsTools) {
      const shape = (tool.input as unknown as { shape: Record<string, { description?: string }> }).shape;
      for (const [key, field] of Object.entries(shape)) {
        expect(field.description, `${tool.name}.${key}`).toBeTruthy();
      }
    }
  });

  it("validates inputs", () => {
    const by = Object.fromEntries(jobsTools.map((t) => [t.name, t]));
    expect(by.jobs_create.input.safeParse({ title: "ab" }).success).toBe(false);
    expect(by.jobs_create.input.safeParse({ title: "Engineer", description: "x" }).success).toBe(true);
    expect(by.jobs_publish.input.safeParse({ jobId: "nope" }).success).toBe(false);
    expect(by.jobs_list.input.safeParse({ limit: 500 }).success).toBe(false);
    expect((by.jobs_list.input.parse({}) as { limit: number }).limit).toBe(25);
  });
});

describe("helpers", () => {
  it("converts plain text to escaped html and keeps html", () => {
    expect(textToHtml("a & b\n\nsecond")).toBe("<p>a &amp; b</p><p>second</p>");
    expect(textToHtml("<p>ok</p>")).toBe("<p>ok</p>");
    expect(draftToHtml({ summary: "S", sections: [{ title: "T", bullets: ["x&y"] }] })).toBe(
      "<p>S</p><h2>T</h2><ul><li>x&amp;y</li></ul>",
    );
  });

  it("merges patches and clears with null", () => {
    const base = { ...newJobBase("Engineer"), department: "Eng", description: "<p>long enough text</p>" };
    const next = mergeJobValues(base, { department: null, currency: "eur", salaryMin: 10, salaryPeriod: "annual" });
    expect(next.department).toBeNull();
    expect(next.currency).toBe("EUR");
    expect(next.title).toBe("Engineer");
    expect(mergeJobValues(base, { description: "Plain\n\ntext" }).description).toBe("<p>Plain</p><p>text</p>");
  });

  it("validates like the web form", () => {
    expect(validateJobValues(newJobBase("Engineer"))).toHaveLength(1);
    const ok = mergeJobValues(newJobBase("Engineer"), { description: "A proper description here" });
    expect(validateJobValues(ok)).toEqual([]);
    const bad = mergeJobValues(ok, { salaryMin: 5, salaryMax: 1 });
    expect(validateJobValues(bad).join(" ")).toContain("salaryMax");
    expect(validateJobValues(bad).join(" ")).toContain("currency");
  });

  it("builds questions with the app parser", () => {
    const [q] = buildQuestions([{ label: "Why us?", type: "textarea", required: true }]);
    expect(q.id).toBe("why-us");
    expect(() => buildQuestions([{ label: "Pick", type: "select", required: false }])).toThrow(McpToolError);
    expect(() =>
      buildQuestions([
        { label: "Same", type: "text", required: false },
        { label: "Same", type: "text", required: false },
      ]),
    ).toThrow(/same id/);
  });

  it("recomputes derived application flags", () => {
    const config = newJobBase("x").applicationConfig;
    const next = applyApplicationFormPatch(config, { fields: { resume: "optional", linkedinUrl: "required", githubUrl: "disabled" } });
    expect(next.resumeRequired).toBe(false);
    expect(next.profileLinks.linkedin).toEqual({ enabled: true, required: true });
    expect(next.profileLinks.github).toEqual({ enabled: false, required: false });
    expect(config.sections.profile.resume.visibility).toBe("required");
  });

  it("computes public links and risk", () => {
    const now = new Date("2026-10-31T00:00:00Z");
    const open = { slug: "eng", status: "open" as const, deletedAt: null, publishedAt: new Date("2026-10-01T00:00:00Z"), validThrough: null };
    expect(publicJobLinks("https://h.test", "acme", open, now).publicUrl).toBe("https://h.test/board/acme/jobs/eng");
    expect(publicJobLinks("https://h.test", "acme", { ...open, status: "draft" }, now).publicUrl).toBeNull();
    const row = { status: "open" as const, applicants: 0, lastAppliedAt: null, publishedAt: open.publishedAt, createdAt: open.publishedAt };
    expect(jobRisk(row, now)?.severity).toBe("critical");
    expect(jobRisk({ ...row, publishedAt: new Date("2026-10-29T00:00:00Z") }, now)).toBeNull();
    expect(jobRisk({ ...row, status: "closed" }, now)).toBeNull();
  });

  it("maps action errors", () => {
    expect(classifyFailure("You do not have permission to perform this action.")).toBe("forbidden");
    expect(classifyFailure("Job not found.")).toBe("not_found");
    expect(classifyFailure("Job has a pending approval request.")).toBe("conflict");
    expect(() => mapActionError(new Error("You are not assigned to this job."))).toThrow(McpToolError);
    const unexpected = new Error("connection reset");
    expect(() => mapActionError(unexpected)).toThrow(unexpected);
    expect(() => mapActionError(Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }))).toThrow(/not found/i);
  });
});
