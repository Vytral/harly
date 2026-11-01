import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Every module that touches the database, the session or the network is mocked:
// these tests cover the tool contracts and the mapping helpers, not the app.
const m = vi.hoisted(() => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getTask: vi.fn(),
  listTasks: vi.fn(),
  requirePermission: vi.fn(),
  getRolePolicy: vi.fn(),
  getWorkspaceTimeZone: vi.fn(),
  getWorkspaceFunnel: vi.fn(),
  getJobFunnel: vi.fn(),
  getWorkspaceSettingsData: vi.fn(),
  updateWorkspaceProfileAction: vi.fn(),
  updateWorkspaceBoardBrandingAction: vi.fn(),
  inviteWorkspaceMembersAction: vi.fn(),
  getAutomationProposal: vi.fn(),
  applyAutomationProposal: vi.fn(),
  getAutomationAiContext: vi.fn(),
  prepareAutomationProposal: vi.fn(),
  deleteWorkflowAction: vi.fn(),
  listWorkflowsAction: vi.fn(),
  getWorkspaceAuditLogs: vi.fn(),
}));

vi.mock("@harly/db", () => ({ db: {}, jobs: {}, workspaceSettings: {} }));
vi.mock("@/features/tasks/actions", () => ({ createTask: m.createTask, updateTask: m.updateTask, deleteTask: m.deleteTask }));
vi.mock("@/features/tasks/data", () => ({
  getTask: m.getTask,
  listTasks: m.listTasks,
  getTaskCounts: vi.fn(),
  getMyTasksDueCount: vi.fn(),
  listWorkspaceMembers: vi.fn(),
}));
vi.mock("@/features/notifications/data", () => ({ listNotifications: vi.fn() }));
vi.mock("@/features/notifications/actions", () => ({
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  markNotificationUnread: vi.fn(),
}));
vi.mock("@/features/reports/advanced", () => ({ getAdvancedHiringAnalytics: vi.fn() }));
vi.mock("@/features/reports/canonical", () => ({
  getDailySeries: vi.fn(),
  getHireStats: vi.fn(),
  getHiresByJob: vi.fn(),
  getJobFunnel: m.getJobFunnel,
  getOfferAcceptance: vi.fn(),
  getSourceEffectiveness: vi.fn(),
  getWorkspaceFunnel: m.getWorkspaceFunnel,
  getWorkspaceTimeZone: m.getWorkspaceTimeZone,
}));
vi.mock("@/features/reports/data", () => ({ getReportsData: vi.fn() }));
vi.mock("@/features/reports/scope", () => ({
  REPORTS_SCOPE_MESSAGE: "Reports are not available for roles limited to specific jobs.",
  ReportsScopeError: class ReportsScopeError extends Error {},
}));
vi.mock("@/features/activity/service", () => ({
  ACTIVITY_ENTITY_TYPES: ["candidate", "application", "job", "note", "document", "task"],
  listActivityEventsForApi: vi.fn(),
  serializeActivityEvent: vi.fn(),
}));
vi.mock("@/features/dashboard/widgets", () => ({
  getCandidatesNeedingReview: vi.fn(),
  getDashboardWidgetAccess: vi.fn(),
  getHiringPerformance: vi.fn(),
  getInbox: vi.fn(),
  getJobsAtRisk: vi.fn(),
  getMyDashboardTasks: vi.fn(),
  getPipelineOverview: vi.fn(),
}));
vi.mock("@/features/search/scope", () => ({
  isUnrestrictedScope: (scope: { jobAccess: string; departments: string[]; regions: string[] }) =>
    scope.jobAccess === "all" && scope.departments.length === 0 && scope.regions.length === 0,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: m.requirePermission,
  getRolePolicy: m.getRolePolicy,
  listWorkspaceRoles: vi.fn(),
}));
vi.mock("@/server/reports/scheduled", () => ({ listScheduledReports: vi.fn() }));

vi.mock("@/features/automations/actions", () => ({
  approveWorkflowAction: vi.fn(),
  cancelRunAction: vi.fn(),
  deleteWorkflowAction: m.deleteWorkflowAction,
  dryRunWorkflowAction: vi.fn(),
  getRunAction: vi.fn(),
  getWorkflowAction: vi.fn(),
  getWorkflowMetricsAction: vi.fn(),
  listPendingWorkflowApprovalsAction: vi.fn(),
  listRunsAction: vi.fn(),
  listWorkflowsAction: m.listWorkflowsAction,
  listWorkflowVersionsAction: vi.fn(),
  publishWorkflowAction: vi.fn(),
  replayRunFromStepAction: vi.fn(),
  requestWorkflowApprovalAction: vi.fn(),
  resolveRunApprovalAction: vi.fn(),
  retryRunAction: vi.fn(),
  rollbackWorkflowAction: vi.fn(),
  setWorkspaceAutomationEnabledAction: vi.fn(),
  toggleWorkflowAction: vi.fn(),
}));
vi.mock("@/features/automations/data", () => ({ getWorkspaceAutomationPolicy: vi.fn() }));
vi.mock("@/features/automations/ai-proposals", () => ({
  applyAutomationProposal: m.applyAutomationProposal,
  createAutomationProposalPreviewToken: vi.fn(() => "preview-token"),
  getAutomationAiContext: m.getAutomationAiContext,
  getAutomationProposal: m.getAutomationProposal,
  nextStepAfterAutomationSimulation: vi.fn(() => "next"),
  prepareAutomationProposal: m.prepareAutomationProposal,
  simulateAutomationProposal: vi.fn(),
}));
vi.mock("@/features/automations/definition/plan-compiler", () => ({
  applyPatchToGraph: vi.fn(),
  automationPatchV1Schema: z.object({ version: z.literal(1), operations: z.array(z.unknown()).min(1) }),
  automationPlanV1Schema: z.object({ version: z.literal(1), name: z.string() }),
  compilePlanToGraph: vi.fn(),
}));
vi.mock("@/features/automations/definition/schema-v2", () => ({
  editorLayoutSchema: z.object({}),
  emptyCanvasGraph: vi.fn(() => ({ nodes: [], edges: [] })),
  emptyLayout: vi.fn(() => ({ positions: {}, collapsedNodeIds: [] })),
  parseGraph: (graph: unknown) => graph,
}));
vi.mock("@/features/automations/definition/subgraph", () => ({ rebaseAutomationPatch: vi.fn() }));
vi.mock("@/features/automations/registry", () => ({ listAutomationToolManifestsV2: vi.fn(() => []) }));
vi.mock("@/features/automations/resource-resolution", () => ({ resolveAutomationResources: vi.fn() }));
vi.mock("@/features/automations/run-repair", () => ({ getWorkflowRunDiagnosis: vi.fn(), prepareAutomationRepair: vi.fn() }));
vi.mock("@/features/automations/schema", () => ({ WORKFLOW_EVENTS: ["application.created"] }));
vi.mock("@/features/automations/simulation-coverage", () => ({ SIMULATION_SCENARIOS: ["all_true", "all_false"] }));

vi.mock("@/features/career-page/config", () => ({ normalizeCareerPageConfig: vi.fn() }));
vi.mock("@/features/security/data", () => ({ getWorkspaceAuditLogs: m.getWorkspaceAuditLogs, getWorkspaceSecuritySettings: vi.fn() }));
vi.mock("@/lib/ai/assistant-branding", () => ({ getAssistantBranding: vi.fn() }));
vi.mock("@/lib/ai/config", () => ({ getWorkspaceAiStatus: vi.fn() }));
vi.mock("@/lib/email/config", () => ({ getWorkspaceEmailStatus: vi.fn(), getWorkspaceInboundEmailStatus: vi.fn() }));
vi.mock("@/lib/mailbox/config", () => ({ getMailboxStatus: vi.fn() }));
vi.mock("@/features/developers/data", () => ({
  listApiKeys: vi.fn(),
  listWebhookEndpoints: vi.fn(),
  serializeApiKey: vi.fn(),
  serializeWebhookEndpoint: vi.fn(),
}));
vi.mock("@/features/rejection-reasons/actions", () => ({
  addRejectionReasonAction: vi.fn(),
  renameRejectionReasonAction: vi.fn(),
  setRejectionReasonArchivedAction: vi.fn(),
}));
vi.mock("@/features/rejection-reasons/data", () => ({ listRejectionReasons: vi.fn() }));
vi.mock("@/features/workspaces/actions", () => ({
  cancelWorkspaceInvitationAction: vi.fn(),
  inviteWorkspaceMembersAction: m.inviteWorkspaceMembersAction,
  resendWorkspaceInvitationAction: vi.fn(),
  updateWorkspaceBoardBrandingAction: m.updateWorkspaceBoardBrandingAction,
  updateWorkspaceProfileAction: m.updateWorkspaceProfileAction,
}));
vi.mock("@/features/workspaces/data", () => ({ getWorkspaceSettingsData: m.getWorkspaceSettingsData }));
vi.mock("@/features/workspaces/legal-settings-actions", () => ({ getLegalSettingsData: vi.fn() }));
vi.mock("@/features/workspaces/portal-settings-actions", () => ({
  savePortalSettingsAction: vi.fn(),
  savePortalUiOptionsAction: vi.fn(),
}));
vi.mock("@/features/workspaces/integrations-registry", () => ({
  CATEGORY_LABELS: {},
  getIntegrationStatuses: vi.fn(),
  INTEGRATIONS: [],
  isConnected: vi.fn(),
}));

import { PERMISSIONS } from "@/features/workspaces/permissions";
import { MCP_TOOL_GROUPS, McpToolError, type McpToolContext, type McpToolDefinition } from "../types";
import { tasksReportsAutomationsSettingsTools as tools } from "./tasks-reports-automations-settings";
import { formatProposal, formatRunSummary, formatWorkflowSummary } from "./ops/automations";
import { resolveReportRange } from "./ops/reports";
import { buildFormData, companyUpdatePlan, stripUrlCredentials } from "./ops/settings";
import {
  assertActionOk,
  boundJson,
  classifyActionError,
  matchesQuery,
  paginateArray,
  parseOrThrow,
  redactSecrets,
} from "./ops/shared";
import { filterTasks, formatTask } from "./ops/tasks";
import type { TaskItem } from "@/features/tasks/shared";

const OWNED_GROUPS = ["tasks", "reports", "automations", "settings"];
const ctx: McpToolContext = {
  workspaceId: "ws-1",
  userId: "user-1",
  clientName: "test-client",
  requestId: "req-1",
  appOrigin: "https://harly.test",
};

function tool(name: string): McpToolDefinition {
  const found = tools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found;
}

function call(name: string, input: Record<string, unknown>) {
  const def = tool(name);
  return def.run(def.input.parse(input), ctx);
}

const task = (overrides: Partial<TaskItem> = {}): TaskItem => ({
  id: "11111111-1111-4111-8111-111111111111",
  title: "Call Ana",
  description: null,
  status: "pending",
  priority: "high",
  dueDate: "2026-11-02T00:00:00.000Z",
  completedAt: null,
  ownerId: "user-1",
  ownerName: "Max",
  ownerImage: null,
  ownerUsername: null,
  candidateId: null,
  candidateName: null,
  applicationId: null,
  jobId: null,
  jobTitle: null,
  interviewId: null,
  createdById: "user-1",
  createdAt: "2026-10-30T10:00:00.000Z",
  updatedAt: "2026-10-30T10:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tool registry contract", () => {
  it("exports tools for the four owned groups only", () => {
    expect(tools.length).toBeGreaterThan(50);
    for (const t of tools) expect(OWNED_GROUPS).toContain(t.group);
    for (const group of OWNED_GROUPS) expect(tools.some((t) => t.group === group)).toBe(true);
  });

  it("uses unique snake_case names prefixed by their group", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z]+(_[a-z0-9]+)+$/);
      expect(t.name.length).toBeLessThanOrEqual(64);
      expect(t.name.startsWith(`${t.group}_`)).toBe(true);
      expect(MCP_TOOL_GROUPS).toContain(t.group);
    }
  });

  it("pairs every tool with a scope of its own area and read/write annotations", () => {
    for (const t of tools) {
      const [area, mode] = t.scope.split(":");
      expect(area).toBe(t.group);
      expect(typeof t.annotations.readOnlyHint).toBe("boolean");
      expect(typeof t.annotations.destructiveHint).toBe("boolean");
      expect(typeof t.annotations.idempotentHint).toBe("boolean");
      expect(typeof t.annotations.openWorldHint).toBe("boolean");
      if (t.annotations.readOnlyHint) {
        expect(t.annotations.destructiveHint).toBe(false);
        expect(mode).toBe("read");
      } else {
        expect(mode).toBe("write");
      }
    }
  });

  it("only references real Harly permissions", () => {
    for (const t of tools) {
      const required = t.permission === null ? [] : Array.isArray(t.permission) ? t.permission : [t.permission];
      for (const permission of required) expect(PERMISSIONS).toContain(permission);
    }
  });

  it("describes every tool and every input field for the model", () => {
    const missing: string[] = [];
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(60);
      expect(t.title.length).toBeGreaterThan(3);
      const schema = t.input as unknown as z.ZodObject<Record<string, z.ZodType>>;
      expect(schema.shape).toBeDefined();
      for (const [key, field] of Object.entries(schema.shape)) {
        if (!field.description) missing.push(`${t.name}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("produces a JSON schema for every input (what tools/list serves)", () => {
    for (const t of tools) {
      const json = z.toJSONSchema(t.input) as { type?: string };
      expect(json.type).toBe("object");
    }
  });

  it("marks deletes, rejections and rollbacks destructive and email-sending tools open-world", () => {
    for (const name of ["tasks_delete", "automations_delete", "automations_rollback", "automations_run_cancel", "settings_invitation_cancel"]) {
      expect(tool(name).annotations.destructiveHint).toBe(true);
    }
    for (const name of ["settings_members_invite", "settings_invitation_resend", "automations_publish", "automations_run_retry"]) {
      expect(tool(name).annotations.openWorldHint).toBe(true);
    }
  });

  it("never exposes tools that create or rotate secrets or touch security policy", () => {
    const forbidden = /(api_key_create|rotate|secret|password|2fa|sso|billing|webhook_create|install|update_security)/;
    for (const t of tools) {
      if (t.scope.endsWith(":write")) expect(t.name).not.toMatch(forbidden);
    }
  });
});

describe("shared helpers", () => {
  it("paginates with a next offset", () => {
    expect(paginateArray([1, 2, 3, 4, 5], 2, 0)).toEqual({ items: [1, 2], total: 5, nextOffset: 2 });
    expect(paginateArray([1, 2, 3, 4, 5], 2, 4)).toEqual({ items: [5], total: 5, nextOffset: null });
    expect(paginateArray([1, 2], 500, -3).items).toEqual([1, 2]);
  });

  it("classifies server action error messages", () => {
    expect(classifyActionError("Task not found.")).toBe("not_found");
    expect(classifyActionError("The selected record is not available to you.")).toBe("forbidden");
    expect(classifyActionError("This draft changed. Save the latest revision and try again.")).toBe("conflict");
    expect(classifyActionError("Automations are temporarily disabled.")).toBe("unavailable");
    expect(classifyActionError("Enter a valid due date.")).toBe("invalid_input");
  });

  it("turns failed action results into tool errors and passes successes through", () => {
    expect(assertActionOk({ success: true }, "x")).toEqual({ success: true });
    expect(assertActionOk({ ok: true }, "x")).toEqual({ ok: true });
    expect(() => assertActionOk({ success: false, error: "Task not found." }, "fallback")).toThrowError(McpToolError);
    try {
      assertActionOk({ ok: false, error: "Not ready.", issues: [{ nodeId: "n1", fieldPath: "to", message: "Required" }] }, "fallback");
    } catch (error) {
      expect((error as McpToolError).message).toContain("n1: to: Required");
    }
    expect(() => assertActionOk({ success: false }, "Fallback message")).toThrowError("Fallback message");
  });

  it("bounds and redacts JSON before it reaches the model", () => {
    const bounded = boundJson({ text: "x".repeat(2000), list: Array.from({ length: 80 }, (_, i) => i) }, { maxString: 10, maxArray: 5 }) as {
      text: string;
      list: unknown[];
    };
    expect(bounded.text.length).toBeLessThan(80);
    expect(bounded.list).toHaveLength(6);
    expect(redactSecrets({ apiKey: "abc", nested: { webhookSecret: "s", name: "ok" }, list: [{ password: "p" }] })).toEqual({
      apiKey: "[redacted]",
      nested: { webhookSecret: "[redacted]", name: "ok" },
      list: [{ password: "[redacted]" }],
    });
  });

  it("matches queries case-insensitively across fields", () => {
    expect(matchesQuery("ana", "Call Ana", null)).toBe(true);
    expect(matchesQuery("zzz", "Call Ana")).toBe(false);
    expect(matchesQuery(undefined, "x")).toBe(true);
  });

  it("reports schema problems readably", () => {
    const schema = z.object({ version: z.literal(1), name: z.string() });
    expect(parseOrThrow(schema, { version: 1, name: "a" }, "The plan")).toEqual({ version: 1, name: "a" });
    expect(() => parseOrThrow(schema, { version: 2 }, "The plan")).toThrowError(/The plan is invalid.*version/);
  });
});

describe("task mapping", () => {
  const now = new Date("2026-11-01T12:00:00Z");

  it("formats a task with owner, links and due state", () => {
    const formatted = formatTask(task({ candidateId: "c1", candidateName: "Ana Ruiz", jobId: "j1", jobTitle: "Designer" }), "https://harly.test/", now);
    expect(formatted).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      owner: { id: "user-1", name: "Max" },
      candidate: { id: "c1", name: "Ana Ruiz" },
      job: { id: "j1", title: "Designer" },
      dueState: "soon",
      url: "https://harly.test/dashboard/tasks",
    });
    expect(formatTask(task({ status: "completed" }), "https://harly.test", now).dueState).toBeNull();
  });

  it("filters by status, due state, links and text", () => {
    const rows = [
      task({ id: "a", dueDate: "2026-10-30T00:00:00.000Z" }),
      task({ id: "b", dueDate: "2026-11-01T00:00:00.000Z", title: "Send offer" }),
      task({ id: "c", dueDate: null }),
      task({ id: "d", status: "completed" }),
    ];
    const open = ["pending", "in_progress"];
    expect(filterTasks(rows, { statuses: open }, now).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(filterTasks(rows, { statuses: open, due: "overdue" }, now).map((r) => r.id)).toEqual(["a"]);
    expect(filterTasks(rows, { statuses: open, due: "no_due" }, now).map((r) => r.id)).toEqual(["c"]);
    expect(filterTasks(rows, { statuses: open, query: "offer" }, now).map((r) => r.id)).toEqual(["b"]);
    expect(filterTasks(rows, { statuses: ["completed"] }, now).map((r) => r.id)).toEqual(["d"]);
  });
});

describe("task tools", () => {
  it("assigns new tasks to the caller by default and returns the stored task", async () => {
    m.createTask.mockResolvedValue({ success: true, taskId: "t-1" });
    m.getTask.mockResolvedValue(task({ id: "t-1" }));
    const result = (await call("tasks_create", { title: "Follow up", dueDate: "2026-11-05" })) as { id: string };
    expect(m.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "Follow up", ownerId: "user-1", dueDate: "2026-11-05", priority: "medium" }));
    expect(result.id).toBe("t-1");
  });

  it("surfaces action failures with the right error code", async () => {
    m.deleteTask.mockResolvedValue({ success: false, error: "Task not found." });
    await expect(call("tasks_delete", { taskId: "11111111-1111-4111-8111-111111111111" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("lists my open tasks by default", async () => {
    m.listTasks.mockResolvedValue([task(), task({ id: "x", status: "completed" })]);
    const result = (await call("tasks_list", {})) as { items: Array<{ id: string }>; total: number };
    expect(m.listTasks).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "user-1" }));
    expect(result.total).toBe(1);
  });

  it("completes a task through updateTask", async () => {
    m.updateTask.mockResolvedValue({ success: true });
    m.getTask.mockResolvedValue(task({ status: "completed" }));
    await call("tasks_complete", { taskId: "11111111-1111-4111-8111-111111111111" });
    expect(m.updateTask).toHaveBeenCalledWith({ taskId: "11111111-1111-4111-8111-111111111111", status: "completed" });
  });
});

describe("report windows", () => {
  const now = new Date("2026-10-31T15:00:00Z");

  it("builds a trailing window with an equal-length previous window", () => {
    const range = resolveReportRange({ days: 30 }, "UTC", now);
    expect(range.window.days).toBe(30);
    expect(range.window.to.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(range.window.from.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(range.previous.to.getTime()).toBe(range.window.from.getTime());
    expect(range.label).toBe("Last 30 days");
    expect(resolveReportRange({ days: 365 }, "UTC", now).label).toBe("Last 12 months");
  });

  it("builds an inclusive custom range in the workspace time zone", () => {
    const range = resolveReportRange({ from: "2026-09-01", to: "2026-09-30" }, "UTC", now);
    expect(range.window.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(range.window.to.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(range.window.days).toBe(30);
    expect(range.previous.from.toISOString()).toBe("2026-08-02T00:00:00.000Z");
    const santiago = resolveReportRange({ from: "2026-09-01", to: "2026-09-01" }, "America/Santiago", now);
    expect(santiago.window.to.getTime() - santiago.window.from.getTime()).toBeGreaterThan(20 * 3_600_000);
  });

  it("rejects half-open, reversed, invalid and oversized ranges", () => {
    expect(() => resolveReportRange({ from: "2026-09-01" }, "UTC", now)).toThrowError(McpToolError);
    expect(() => resolveReportRange({ from: "2026-09-10", to: "2026-09-01" }, "UTC", now)).toThrowError(/before/);
    expect(() => resolveReportRange({ from: "2026-02-31", to: "2026-03-05" }, "UTC", now)).toThrowError(/valid calendar date/);
    expect(() => resolveReportRange({ from: "2020-01-01", to: "2026-01-01" }, "UTC", now)).toThrowError(/limited/);
  });
});

describe("report tools", () => {
  it("refuses roles limited to specific jobs", async () => {
    m.requirePermission.mockResolvedValue({ organization: { id: "ws-1" }, roleKey: "hiring_manager" });
    m.getRolePolicy.mockResolvedValue({ scope: { jobAccess: "assigned", departments: [], regions: [] } });
    await expect(call("reports_funnel", {})).rejects.toMatchObject({ code: "forbidden" });
    expect(m.getWorkspaceFunnel).not.toHaveBeenCalled();
  });

  it("uses the per-job funnel when a job is given", async () => {
    m.requirePermission.mockResolvedValue({ organization: { id: "ws-1" }, roleKey: "admin" });
    m.getRolePolicy.mockResolvedValue({ scope: { jobAccess: "all", departments: [], regions: [] } });
    m.getWorkspaceTimeZone.mockResolvedValue("UTC");
    m.getJobFunnel.mockResolvedValue({ applicationsReceived: 4, stages: [] });
    const jobId = "22222222-2222-4222-8222-222222222222";
    const result = (await call("reports_funnel", { jobId, days: 90 })) as { jobId: string; applicationsReceived: number };
    expect(m.getJobFunnel).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-1", jobId }));
    expect(result).toMatchObject({ jobId, applicationsReceived: 4 });
  });
});

describe("automation mapping", () => {
  it("summarizes workflows and runs without payloads", () => {
    const summary = formatWorkflowSummary(
      {
        id: "w1", name: "Rejection email", description: null, enabled: true, status: "published", triggerEvent: "application.rejected",
        engineVersion: 2, draftRevision: 3, contentHash: "h", hasUnpublishedChanges: false, publishedAt: "2026-10-01T00:00:00.000Z",
        approvalRequestedAt: null, approvedAt: null, updatedAt: "2026-10-02T00:00:00.000Z", createdAt: "2026-09-01T00:00:00.000Z", circuitOpenUntil: null,
      },
      "https://harly.test",
    );
    expect(summary).toMatchObject({ id: "w1", draftRevision: 3, url: "https://harly.test/dashboard/automations/w1" });
    expect(summary).not.toHaveProperty("contentHash");
    const run = formatRunSummary({
      id: "r1", workflowId: "w1", triggerEvent: "x", status: "failed", logicalStatus: null, attemptCount: 2, maxAttempts: 3,
      durationMs: 10, startedAt: "a", finishedAt: null, replayOfRunId: null, cancelRequestedAt: null, error: { message: "boom", token: "secret" },
    });
    expect(run.attempts).toBe("2/3");
    expect(JSON.stringify(run)).not.toContain("secret");
  });

  it("describes a proposal compactly", () => {
    const view = formatProposal({
      id: "p1", workflowId: null, baseRevision: null, baseContentHash: null, localSnapshotHash: null, name: "Auto", description: null,
      graph: { schemaVersion: 2, entryNodeId: "trigger", nodes: [{ id: "trigger", type: "trigger", event: "application.created" }], edges: [] },
      layout: { positions: {}, collapsedNodeIds: [] }, diff: [{ kind: "node_added", id: "trigger" }], issues: [], simulation: null,
      redactionMetadata: { version: 1, secretsRedacted: true }, status: "prepared", expiresAt: "2026-10-31T10:30:00.000Z", appliedRevision: null,
    } as never);
    expect(view).toMatchObject({ proposalId: "p1", isNewAutomation: true, validationIssueCount: 0, changeCount: 1, simulation: null });
    expect(view.nodes[0]).toMatchObject({ id: "trigger", event: "application.created" });
  });
});

describe("automation tools", () => {
  it("requires exactly one of patch or graph", async () => {
    await expect(call("automations_prepare_patch", { name: "X" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(call("automations_prepare_patch", { name: "X", patch: {}, graph: {} })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("will not apply a proposal that was never simulated", async () => {
    m.getAutomationProposal.mockResolvedValue({ id: "p1", simulation: null });
    await expect(call("automations_apply_proposal", { proposalId: "33333333-3333-4333-8333-333333333333" })).rejects.toMatchObject({ code: "invalid_input" });
    expect(m.applyAutomationProposal).not.toHaveBeenCalled();
  });

  it("applies a simulated proposal as an unpublished draft with a deterministic action id", async () => {
    const proposalId = "33333333-3333-4333-8333-333333333333";
    m.getAutomationProposal.mockResolvedValue({ id: proposalId, simulation: { graphHash: "g" } });
    m.applyAutomationProposal.mockResolvedValue({ workflowId: "w9", draftRevision: 2, replayed: false });
    const result = (await call("automations_apply_proposal", { proposalId })) as { published: boolean; workflowId: string };
    expect(m.applyAutomationProposal).toHaveBeenCalledWith(expect.objectContaining({ actionId: `mcp:${proposalId}`, previewToken: "preview-token", actorId: "user-1" }));
    expect(result).toMatchObject({ published: false, workflowId: "w9" });
  });

  it("paginates and filters the automation list", async () => {
    m.listWorkflowsAction.mockResolvedValue({
      ok: true,
      workflows: [
        { id: "a", name: "Offer email", status: "published", enabled: true, triggerEvent: "x", engineVersion: 2, draftRevision: 1, hasUnpublishedChanges: false, description: null },
        { id: "b", name: "Reminder", status: "draft", enabled: false, triggerEvent: "x", engineVersion: 2, draftRevision: 1, hasUnpublishedChanges: true, description: null },
      ],
    });
    const result = (await call("automations_list", { status: "draft" })) as { items: Array<{ id: string }>; total: number };
    expect(result.items.map((item) => item.id)).toEqual(["b"]);
    expect(result.total).toBe(1);
  });

  it("maps a failed delete to a tool error", async () => {
    m.deleteWorkflowAction.mockResolvedValue({ ok: false, error: "Automation not found." });
    await expect(call("automations_delete", { workflowId: "44444444-4444-4444-8444-444444444444" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("settings helpers", () => {
  it("strips credentials from URLs", () => {
    expect(stripUrlCredentials("https://user:pw@api.example.com/v1")).toBe("https://api.example.com/v1");
    expect(stripUrlCredentials(null)).toBeNull();
  });

  it("builds FormData and skips undefined", () => {
    const form = buildFormData({ a: "1", b: true, c: null, d: undefined });
    expect(form.get("a")).toBe("1");
    expect(form.get("b")).toBe("true");
    expect(form.get("c")).toBe("");
    expect(form.has("d")).toBe(false);
  });

  it("decides which company actions to run", () => {
    expect(companyUpdatePlan({ name: "Acme" })).toEqual({ profile: true, branding: false });
    expect(companyUpdatePlan({ tagline: "Hi" })).toEqual({ profile: false, branding: true });
    expect(companyUpdatePlan({})).toEqual({ profile: false, branding: false });
  });
});

describe("settings tools", () => {
  const branding = {
    name: "Acme", slug: "acme", logoUrl: "/uploads/logo.png", tagline: "Old tagline", description: "d", websiteUrl: "https://acme.test",
    primaryColor: "#111111", heroImageUrl: null, boardStyle: "classic", logoStyle: "bordered", sidebarLogoStyle: "bordered",
    sidebarLogoUrl: null, sidebarLogoDarkUrl: null, hideHarlyBranding: false, gravatarEnabled: false, timezone: "UTC",
  };

  it("preserves untouched profile fields when renaming the workspace", async () => {
    m.getWorkspaceSettingsData.mockResolvedValue({ branding });
    m.updateWorkspaceProfileAction.mockResolvedValue({ success: true });
    await call("settings_company_update", { name: "Acme Inc" });
    expect(m.updateWorkspaceBoardBrandingAction).not.toHaveBeenCalled();
    const form = m.updateWorkspaceProfileAction.mock.calls[0][1] as FormData;
    expect(form.get("name")).toBe("Acme Inc");
    expect(form.get("logoUrl")).toBe("/uploads/logo.png");
    expect(form.get("timezone")).toBe("UTC");
  });

  it("rejects an invalid time zone before calling any action", async () => {
    await expect(call("settings_company_update", { timezone: "Mars/Olympus" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(call("settings_company_update", {})).rejects.toMatchObject({ code: "invalid_input" });
    expect(m.updateWorkspaceProfileAction).not.toHaveBeenCalled();
  });

  it("invites by passing the invites as JSON to the bulk action", async () => {
    m.inviteWorkspaceMembersAction.mockResolvedValue({ success: true, sent: 1, added: 0, skipped: [] });
    const result = await call("settings_members_invite", { invites: [{ email: "new@acme.test", role: "recruiter" }] });
    const form = m.inviteWorkspaceMembersAction.mock.calls[0][1] as FormData;
    expect(JSON.parse(String(form.get("invites")))).toEqual([{ email: "new@acme.test", role: "recruiter" }]);
    expect(result).toEqual({ sent: 1, added: 0, skipped: [] });
  });

  it("refuses the audit log to scoped roles", async () => {
    m.requirePermission.mockResolvedValue({ organization: { id: "ws-1" }, roleKey: "custom" });
    m.getRolePolicy.mockResolvedValue({ scope: { jobAccess: "assigned", departments: [], regions: [] } });
    await expect(call("settings_audit_log_list", {})).rejects.toMatchObject({ code: "forbidden" });
    expect(m.getWorkspaceAuditLogs).not.toHaveBeenCalled();
  });

  it("omits IP addresses and user agents from audit rows", async () => {
    m.requirePermission.mockResolvedValue({ organization: { id: "ws-1" }, roleKey: "admin" });
    m.getRolePolicy.mockResolvedValue({ scope: { jobAccess: "all", departments: [], regions: [] } });
    m.getWorkspaceAuditLogs.mockResolvedValue([
      { id: "1", createdAt: "2026-10-30T00:00:00.000Z", action: "task.deleted", severity: "warning", actorEmail: "a@acme.test", resourceType: "task", resourceId: "t", ipAddress: "1.2.3.4", userAgent: "UA", metadata: {} },
    ]);
    const result = (await call("settings_audit_log_list", {})) as { items: Array<Record<string, unknown>> };
    expect(result.items[0]).not.toHaveProperty("ipAddress");
    expect(result.items[0]).not.toHaveProperty("userAgent");
    expect(result.items[0].action).toBe("task.deleted");
  });
});
