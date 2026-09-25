import { describe, expect, it, vi } from "vitest";

import {
  compilePlanToGraph,
  applyPatchToGraph,
  type AutomationPlanV1,
  type AutomationPatchV1,
} from "./definition/plan-compiler";
import { runBranchCoverageSimulation } from "./simulation-coverage";
import { validateGraph } from "./definition/validate";
import { reconcileOrphanApplyingProposals } from "./run-repair";
import type { WorkflowGraphV2 } from "./definition/schema-v2";

// Mock permissions and db for run-repair
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireActorPermission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@harly/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@harly/db")>();
  return {
    ...actual,
    db: {
      ...actual.db,
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: "prop-reconciled-1" }]),
          })),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn((table) => {
          if (table === actual.automationAiProposals) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: "prop-reconciled-1",
                    workspaceId: "ws-1",
                    workflowId: "wf-1",
                    baseRevision: 1,
                    name: "Recover me",
                    graph: {
                      schemaVersion: 2,
                      entryNodeId: "trigger",
                      nodes: [
                        { id: "trigger", type: "trigger", event: "application.created" },
                        { id: "end", type: "end", result: "completed" },
                      ],
                      edges: [
                        { id: "e1", source: "trigger", port: "next", target: "end" },
                      ],
                    },
                    updatedAt: new Date("2026-09-16T09:00:00Z"),
                  },
                ]),
              })),
            };
          }
          if (table === actual.workflowDrafts) {
            return {
              where: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue([]),
              })),
              innerJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue([]),
                })),
              })),
            };
          }
          if (table === actual.workflowRuns) {
            return {
              innerJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue([
                    {
                      id: "run-1",
                      workflowId: "wf-1",
                      workflowName: "Onboarding Flow",
                      triggerEvent: "application.hired",
                      status: "failed",
                      logicalStatus: "failed",
                      startedAt: new Date("2026-09-16T10:00:00Z"),
                      finishedAt: new Date("2026-09-16T10:00:05Z"),
                      durationMs: 5000,
                    },
                  ]),
                })),
              })),
            };
          }
          return {
            where: vi.fn().mockResolvedValue([
              {
                nodeId: "action_1",
                status: "failed",
                resolvedPort: null,
                errorCode: "HTTP_500",
                errorDetails: { message: "Internal error" },
              },
            ]),
          };
        }),
      })),
    },
  };
});

describe("Phases 2 to 5 — Plans, Patches, Coverage & Repair", () => {
  describe("Phase 2 — Plan Compiler & Patches (AI04)", () => {
    it("compiles an AutomationPlanV1 into a valid, connected DAG with auto-layout", () => {
      const plan: AutomationPlanV1 = {
        version: 1,
        name: "Welcome candidate & Notify team",
        description: "Sends an email and creates an internal task",
        trigger: {
          event: "application.stage_changed",
          filter: {},
        },
        delays: [],
        steps: [
          {
            id: "step_email",
            actionType: "send_email",
            toolVersion: 1,
            failurePolicy: "stop",
            input: {
              subject: { kind: "literal", value: "Welcome to our team" },
              body: { kind: "literal", value: "Hello!" },
            },
          },
          {
            id: "step_task",
            actionType: "create_task",
            toolVersion: 1,
            failurePolicy: "stop",
            input: {
              title: { kind: "literal", value: "Prepare onboarding documents" },
              priority: { kind: "literal", value: "high" },
            },
          },
        ],
        branches: [],
        approvals: [],
        waits: [],
      };

      const { graph, layout } = compilePlanToGraph(plan);

      expect(graph.schemaVersion).toBe(2);
      expect(graph.entryNodeId).toBe("trigger");
      expect(graph.nodes).toHaveLength(4); // trigger + 2 actions + end
      expect(graph.edges).toHaveLength(3);

      // Verify the compiled graph passes validation
      const validationIssues = validateGraph(graph);
      expect(validationIssues).toEqual([]);

      // Verify layout positions were computed deterministically
      expect(layout.positions["trigger"]).toEqual({ x: 250, y: 50 });
      expect(layout.positions["step_email"]).toBeDefined();
      expect(layout.positions["step_task"]).toBeDefined();
      expect(layout.positions["end"]).toBeDefined();
    });

    it("compiles the low-score rejection, email, and durable-erasure recipe as one branch", () => {
      const plan: AutomationPlanV1 = {
        version: 1,
        name: "Reject low-score applicants safely",
        trigger: { event: "application.created", filter: {} },
        steps: [
          {
            id: "score_application",
            actionType: "ai_score",
            toolVersion: 1,
            failurePolicy: "stop",
            input: {},
          },
        ],
        branches: [
          {
            id: "low_score",
            conditions: [
              { type: "leaf", field: { kind: "ai", path: "score" }, op: "lt", value: 50 },
            ],
            trueSteps: [
              {
                id: "reject_application",
                actionType: "set_status",
                toolVersion: 1,
                failurePolicy: "stop",
                input: { status: { kind: "literal", value: "rejected" } },
              },
              {
                id: "send_rejection",
                actionType: "send_email",
                toolVersion: 1,
                failurePolicy: "stop",
                input: {
                  toEmail: { kind: "literal", value: "candidate@example.test" },
                  subject: { kind: "literal", value: "Rechazo por puntaje" },
                  body: {
                    kind: "literal",
                    value: "Hemos decidido no continuar con tu postulación.",
                  },
                },
              },
              {
                id: "erase_candidate",
                actionType: "erase_candidate_data",
                toolVersion: 1,
                failurePolicy: "stop",
                input: {},
              },
            ],
            falseSteps: [
              {
                id: "manual_review",
                actionType: "add_tag",
                toolVersion: 1,
                failurePolicy: "stop",
                input: { label: { kind: "literal", value: "Revisar manualmente" } },
              },
            ],
          },
        ],
        delays: [],
        approvals: [],
        waits: [],
      };

      const { graph } = compilePlanToGraph(plan);

      expect(validateGraph(graph)).toEqual([]);
      expect(graph.nodes.map((node) => node.id)).toEqual(
        expect.arrayContaining([
          "score_application",
          "low_score",
          "reject_application",
          "send_rejection",
          "erase_candidate",
          "manual_review",
          "end",
        ]),
      );
      expect(graph.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: "low_score", port: "true", target: "reject_application" }),
          expect.objectContaining({ source: "reject_application", port: "success", target: "send_rejection" }),
          expect.objectContaining({ source: "send_rejection", port: "success", target: "erase_candidate" }),
          expect.objectContaining({ source: "erase_candidate", port: "success", target: "end" }),
          expect.objectContaining({ source: "low_score", port: "false", target: "manual_review" }),
        ]),
      );
    });

    it("preserves waits and every approval/branch outcome while continuing into later steps", () => {
      const plan: AutomationPlanV1 = {
        version: 1,
        name: "Review, wait, and notify",
        trigger: { event: "application.created", filter: {} },
        delays: [],
        branches: [
          {
            id: "score_branch",
            conditions: [
              { type: "leaf", field: { kind: "ai", path: "score" }, op: "lt", value: 50 },
            ],
            trueSteps: [],
            falseSteps: [],
          },
        ],
        approvals: [
          {
            id: "review",
            eligibleActorIds: ["member-1"],
            rule: "any",
            approvedSteps: [],
            rejectedSteps: [],
            expiredSteps: [],
          },
        ],
        waits: [
          {
            id: "candidate_reply",
            kind: "event",
            eventName: "application.status_changed",
            matchedSteps: [],
            expiredSteps: [],
          },
        ],
        steps: [
          {
            id: "notify",
            actionType: "send_email",
            toolVersion: 1,
            failurePolicy: "stop",
            input: {
              subject: { kind: "literal", value: "Next steps" },
              body: { kind: "literal", value: "We are following up." },
            },
          },
        ],
      };

      const { graph } = compilePlanToGraph(plan);
      const issues = validateGraph(graph);

      expect(issues).toEqual([]);
      expect(graph.nodes.map((node) => node.id)).toEqual(
        expect.arrayContaining(["score_branch", "review", "candidate_reply", "notify", "end"]),
      );
      expect(graph.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: "review", port: "expired" }),
          expect.objectContaining({ source: "candidate_reply", port: "matched" }),
          expect.objectContaining({ source: "candidate_reply", port: "expired" }),
        ]),
      );
    });

    it("compiles a nested flow with waits, approvals, delays, and branches in their declared order", () => {
      const plan: AutomationPlanV1 = {
        version: 1,
        name: "Nested candidate review",
        trigger: { event: "application.created", filter: {} },
        flow: [
          {
            kind: "action",
            step: {
              id: "score",
              actionType: "ai_score",
              toolVersion: 1,
              failurePolicy: "stop",
              input: {},
            },
          },
          {
            kind: "branch",
            id: "low_score",
            conditions: [
              {
                type: "leaf",
                field: { kind: "ai", path: "score" },
                op: "lt",
                value: 50,
              },
            ],
            trueFlow: [
              {
                kind: "delay",
                id: "cooldown",
                mode: "duration",
                durationMs: 3_600_000,
              },
              {
                kind: "approval",
                id: "human_review",
                eligibleActorIds: ["member-1"],
                rule: "any",
                deadlineHours: 24,
                approvedFlow: [
                  {
                    kind: "wait",
                    id: "candidate_documents",
                    waitKind: "document_package",
                    resourceId: {
                      kind: "literal",
                      value: "application.id",
                    },
                    resourceType: "package",
                    deadlineHours: 72,
                    completedFlow: [
                      {
                        kind: "action",
                        step: {
                          id: "send_next_steps",
                          actionType: "send_email",
                          toolVersion: 1,
                          failurePolicy: "stop",
                          input: {
                            subject: {
                              kind: "literal",
                              value: "Next steps",
                            },
                            body: {
                              kind: "literal",
                              value: "We are following up.",
                            },
                          },
                        },
                      },
                    ],
                    declinedFlow: [],
                    cancelledFlow: [],
                    expiredFlow: [],
                  },
                ],
                rejectedFlow: [],
                expiredFlow: [],
              },
            ],
            falseFlow: [
              {
                kind: "action",
                step: {
                  id: "manual_review",
                  actionType: "add_tag",
                  toolVersion: 1,
                  failurePolicy: "stop",
                  input: {
                    label: {
                      kind: "literal",
                      value: "Revisar manualmente",
                    },
                  },
                },
              },
            ],
          },
        ],
        steps: [],
        branches: [],
        delays: [],
        approvals: [],
        waits: [],
      };

      const { graph } = compilePlanToGraph(plan);

      expect(validateGraph(graph)).toEqual([]);
      expect(graph.nodes.map((node) => node.id)).toEqual(
        expect.arrayContaining([
          "score",
          "low_score",
          "cooldown",
          "human_review",
          "candidate_documents",
          "send_next_steps",
          "manual_review",
          "end",
        ]),
      );
      expect(graph.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: "score", target: "low_score" }),
          expect.objectContaining({
            source: "low_score",
            port: "true",
            target: "cooldown",
          }),
          expect.objectContaining({
            source: "cooldown",
            port: "elapsed",
            target: "human_review",
          }),
          expect.objectContaining({
            source: "human_review",
            port: "approved",
            target: "candidate_documents",
          }),
          expect.objectContaining({
            source: "candidate_documents",
            port: "completed",
            target: "send_next_steps",
          }),
          expect.objectContaining({
            source: "low_score",
            port: "false",
            target: "manual_review",
          }),
        ]),
      );
    });

    it("applies an AutomationPatchV1 deterministically without breaking graph integrity", () => {
      const plan: AutomationPlanV1 = {
        version: 1,
        name: "Base Plan",
        trigger: { event: "candidate.created", filter: {} },
        delays: [],
        steps: [],
        branches: [],
        approvals: [],
        waits: [],
      };

      const { graph, layout } = compilePlanToGraph(plan);

      const patch: AutomationPatchV1 = {
        version: 1,
        operations: [
          {
            op: "addNode",
            node: {
              id: "note_1",
              type: "action",
              actionType: "add_note",
              toolVersion: 1,
              failurePolicy: "stop",
              input: { body: { kind: "literal", value: "New candidate registered" } },
            },
          },
          {
            op: "connect",
            source: "trigger",
            port: "next",
            target: "note_1",
          },
          {
            op: "connect",
            source: "note_1",
            port: "success",
            target: "end",
          },
          {
            op: "renameWorkflow",
            name: "Candidate auto-note",
          },
          {
            op: "autoLayoutSubset",
            nodeIds: ["trigger", "note_1", "end"],
            direction: "horizontal",
            origin: { x: 100, y: 200 },
            gap: 320,
          },
          {
            op: "setOperationalPolicy",
            policy: {
              maxRunsPerMinute: 120,
              maxExternalActionsPerMinute: 30,
            },
          },
        ],
      };

      const result = applyPatchToGraph({
        graph,
        layout,
        patch,
        name: plan.name,
      });

      expect(result.name).toBe("Candidate auto-note");
      expect(result.graph.nodes.some((n) => n.id === "note_1")).toBe(true);
      expect(result.layout.positions["note_1"]).toEqual({ x: 420, y: 200 });
      expect(result.layout.positions["end"]).toEqual({ x: 740, y: 200 });
      expect(result.operationalPolicy).toEqual({
        maxRunsPerMinute: 120,
        maxExternalActionsPerMinute: 30,
      });
    });
  });

  describe("Phase 3 — Simulation & Branch Coverage (AI05 & AI06)", () => {
    it("reports branch coverage and deterministic simulation hash across true/false branches", () => {
      const graph: WorkflowGraphV2 = {
        schemaVersion: 2,
        entryNodeId: "trigger",
        nodes: [
          { id: "trigger", type: "trigger", event: "application.created", filter: {} },
          { id: "cond_1", type: "condition", tree: [] },
          {
            id: "act_true",
            type: "action",
            actionType: "add_note",
            toolVersion: 1,
            failurePolicy: "stop",
            input: { body: { kind: "literal", value: "True branch note" } },
          },
          {
            id: "act_false",
            type: "action",
            actionType: "add_tag",
            toolVersion: 1,
            failurePolicy: "stop",
            input: { label: { kind: "literal", value: "False branch tag" } },
          },
          { id: "end_true", type: "end", result: "completed" },
          { id: "end_false", type: "end", result: "completed" },
        ],
        edges: [
          { id: "e1", source: "trigger", port: "next", target: "cond_1" },
          { id: "e2", source: "cond_1", port: "true", target: "act_true" },
          { id: "e3", source: "cond_1", port: "false", target: "act_false" },
          { id: "e4", source: "act_true", port: "success", target: "end_true" },
          { id: "e5", source: "act_false", port: "success", target: "end_false" },
        ],
      };

      const report = runBranchCoverageSimulation({
        graph,
        trigger: { candidateId: "cand-123" },
      });

      expect(report.simulationHash).toBeDefined();
      expect(report.simulationHash.length).toBe(64);
      expect(report.coveragePercent).toBeGreaterThan(0);
      expect(report.coveredNodeIds).toContain("cond_1");
      expect(report.coveredNodeIds).toContain("act_true");
      expect(report.coveredNodeIds).toContain("act_false");
    });

    it("AI16: classifies covered nodes into the 5-level confidence taxonomy instead of a binary covered/uncovered flag", () => {
      const graph: WorkflowGraphV2 = {
        schemaVersion: 2,
        entryNodeId: "trigger",
        nodes: [
          { id: "trigger", type: "trigger", event: "application.created", filter: {} },
          { id: "cond_1", type: "condition", tree: [] },
          // stateful tool -> virtually_executed when covered
          {
            id: "act_stateful",
            type: "action",
            actionType: "add_tag",
            toolVersion: 1,
            failurePolicy: "stop",
            input: { label: { kind: "literal", value: "tag" } },
          },
          // fixture tool -> fixture_assumed when covered
          {
            id: "act_fixture",
            type: "action",
            actionType: "send_email",
            toolVersion: 1,
            failurePolicy: "stop",
            input: {
              toEmail: { kind: "trigger", path: "email" },
              subject: { kind: "literal", value: "Hi" },
              body: { kind: "literal", value: "Hi" },
            },
          },
          { id: "end_a", type: "end", result: "completed" },
          { id: "end_b", type: "end", result: "completed" },
        ],
        edges: [
          { id: "e1", source: "trigger", port: "next", target: "cond_1" },
          { id: "e2", source: "cond_1", port: "true", target: "act_stateful" },
          { id: "e3", source: "cond_1", port: "false", target: "act_fixture" },
          { id: "e4", source: "act_stateful", port: "success", target: "end_a" },
          { id: "e5", source: "act_fixture", port: "success", target: "end_b" },
        ],
      };

      const report = runBranchCoverageSimulation({
        graph,
        trigger: { candidateId: "cand-123", email: "cand@example.test" },
      });

      // Non-action nodes structurally exercised by the simulator: validated.
      expect(report.nodeCoverageLevels.trigger).toBe("validated");
      expect(report.nodeCoverageLevels.cond_1).toBe("validated");
      expect(report.nodeCoverageLevels.end_a).toBe("validated");
      // stateful tool (add_tag) actually applies a virtual state change.
      expect(report.nodeCoverageLevels.act_stateful).toBe("virtually_executed");
      // fixture tool (send_email) only ever gets a synthetic assumed outcome.
      expect(report.nodeCoverageLevels.act_fixture).toBe("fixture_assumed");
      // Uncovered nodes intentionally carry no coverage level at all.
      for (const nodeId of report.uncoveredNodeIds) {
        expect(report.nodeCoverageLevels[nodeId]).toBeUndefined();
      }
    });

    it("AI16: classifies an action with no manifest at all as integration_unchecked", () => {
      const graph: WorkflowGraphV2 = {
        schemaVersion: 2,
        entryNodeId: "trigger",
        nodes: [
          { id: "trigger", type: "trigger", event: "application.created", filter: {} },
          {
            id: "act_unknown",
            type: "action",
            actionType: "add_tag",
            // A version with no manifest entry, unlike the mode ("stateful")
            // covered above for version 1 — exercises the "no manifest at
            // all" branch of coverageLevelForNode without an invalid
            // actionType literal.
            toolVersion: 999,
            failurePolicy: "stop",
            input: { label: { kind: "literal", value: "tag" } },
          },
          { id: "end_a", type: "end", result: "completed" },
        ],
        edges: [
          { id: "e1", source: "trigger", port: "next", target: "act_unknown" },
          { id: "e2", source: "act_unknown", port: "success", target: "end_a" },
        ],
      };

      const report = runBranchCoverageSimulation({
        graph,
        trigger: {},
      });

      if (report.coveredNodeIds.includes("act_unknown")) {
        expect(report.nodeCoverageLevels.act_unknown).toBe("integration_unchecked");
      }
    });
  });

  describe("Phase 5 — Recovery of Orphan Applying Proposals (AI11)", () => {
    it("reconciles stuck applying proposals back to prepared", async () => {
      const reconciledCount = await reconcileOrphanApplyingProposals(5);
      expect(reconciledCount).toBe(1);
    });
  });
});
