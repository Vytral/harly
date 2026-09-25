import { describe, expect, it } from "vitest";

import { classifyHarlyIntent } from "@/lib/ai/agent/intent";
import { buildHarlyTools } from "@/lib/ai/agent";
import { getHarlyCoreProductContext } from "@/lib/ai/knowledge/harly-product-knowledge";
import { TOOL_LABELS, getToolLabel } from "@/components/dashboard/HarlyAIPanel";
import {
  ACTION_REGISTRY,
  getAutomationTool,
} from "@/features/automations/registry";
import { validateGraphForPublish } from "@/features/automations/publish-validation";
import { compileValidGraph } from "@/features/automations/definition/compile";
import {
  advance,
  resolveBinding,
  type ExecutionSnapshot,
} from "@/features/automations/runtime/advance";
import { simulate } from "@/features/automations/runtime/simulate";
import { runBranchCoverageSimulation } from "@/features/automations/simulation-coverage";
import { defaultSimulationFixture } from "@/features/automations/runtime/simulation-fixtures";
import {
  evaluateConditions,
  type ConditionContext,
} from "@/features/automations/conditions";
import type { WorkflowGraphV2 } from "@/features/automations/definition/schema-v2";
import type { Permission } from "@/features/workspaces/permissions";

describe("Harly AI × Automations End-to-End Scenarios", () => {
  const workspaceId = "ws-test-e2e-1";
  const userId = "usr-recruiter-1";
  const permissions: Permission[] = [
    "automations:manage",
    "candidates:view",
    "candidates:edit",
    "collab:write",
  ];

  describe("Scenario 1: New applicant evaluation with 1-hour delay and email invitation", () => {
    const userPrompt =
      "Whenever someone applies for a position, evaluate how well their profile matches the job. If they're a strong match, wait an hour and send them an email inviting them to continue.";

    it("understands the request naturally without artificial regex intent matching", () => {
      const intent = classifyHarlyIntent(userPrompt);
      expect(intent).toBe("automation_build");
    });

    it("makes automation capabilities and ai_score discoverable to the agent", async () => {
      const tools = buildHarlyTools({
        workspaceId,
        userId,
        permissions,
      });

      expect(tools).toHaveProperty("listAutomationTools");
      expect(tools).toHaveProperty("prepareAutomationPatch");
      expect(tools).toHaveProperty("prepareAutomationPlan");
      expect(tools).toHaveProperty("simulateAutomationProposal");
      expect(tools).toHaveProperty("applyAutomationProposal");

      // Execute listAutomationTools to ensure ai_score is declared with its full contract
      const result = await tools.listAutomationTools.execute!({} as never, {
        toolCallId: "call-1",
        messages: [],
      });
      expect(result).toBeDefined();
      const aiScoreManifest = (
        result as { tools: Array<Record<string, unknown>> }
      ).tools.find((manifest) => manifest.type === "ai_score");
      expect(aiScoreManifest).toBeDefined();
      if (!aiScoreManifest) return;
      expect(aiScoreManifest.outputFields).toEqual(
        expect.arrayContaining([
          "applicationId",
          "score",
          "recommendation",
          "evaluationId",
        ]),
      );
      expect(aiScoreManifest.requiresPermission).toBe("candidates:edit");
    });

    it("builds, validates, simulates, and executes the complete workflow DAG end-to-end", async () => {
      // 1. Construct the complete WorkflowGraphV2 representing this request
      const graph: WorkflowGraphV2 = {
        schemaVersion: 2,
        entryNodeId: "trigger_node",
        nodes: [
          {
            id: "trigger_node",
            type: "trigger",
            event: "application.created",
            filter: {},
          },
          {
            id: "score_node",
            type: "action",
            name: "Evaluate candidate match",
            actionType: "ai_score",
            toolVersion: 1,
            failurePolicy: "stop",
            input: {}, // inherits target from trigger
          },
          {
            id: "condition_match",
            type: "condition",
            name: "Is strong match?",
            tree: [
              {
                type: "leaf",
                field: { kind: "ai", path: "score" },
                op: "gte",
                value: 80,
              },
            ],
          },
          {
            id: "delay_1h",
            type: "delay",
            name: "Wait 1 hour",
            mode: "duration",
            durationMs: 3600000,
          },
          {
            id: "invite_email",
            type: "action",
            name: "Send invitation email",
            actionType: "send_email",
            toolVersion: 1,
            failurePolicy: "stop",
            input: {
              subject: {
                kind: "literal",
                value: "Next steps with your application",
              },
              body: {
                kind: "literal",
                value:
                  "We were impressed by your profile and invite you to next steps.",
              },
            },
          },
          {
            id: "end_completed",
            type: "end",
            result: "completed",
          },
        ],
        edges: [
          {
            id: "e1",
            source: "trigger_node",
            port: "next",
            target: "score_node",
          },
          {
            id: "e2",
            source: "score_node",
            port: "success",
            target: "condition_match",
          },
          {
            id: "e3",
            source: "condition_match",
            port: "true",
            target: "delay_1h",
          },
          {
            id: "e4",
            source: "condition_match",
            port: "false",
            target: "end_completed",
          },
          {
            id: "e5",
            source: "delay_1h",
            port: "elapsed",
            target: "invite_email",
          },
          {
            id: "e6",
            source: "invite_email",
            port: "success",
            target: "end_completed",
          },
        ],
      };

      // 2. Validate the graph with the real publish validator
      const issues = validateGraphForPublish(
        { name: "Auto-evaluate and invite applicants", graph },
        getAutomationTool,
      );
      expect(issues).toEqual([]);

      // 3. Compile and simulate using runtime simulator
      const triggerPayload = {
        candidateId: "cand-1",
        applicationId: "app-1",
        jobId: "job-1",
        candidate: { email: "candidate@example.com", name: "Maria Garcia" },
      };

      const fixtures = {
        score_node: defaultSimulationFixture(graph.nodes[1]!),
        delay_1h: defaultSimulationFixture(graph.nodes[3]!),
        invite_email: defaultSimulationFixture(graph.nodes[4]!),
      };

      // Virtual state for dry-run condition evaluation
      const virtualContext: ConditionContext = {
        workspaceId,
        candidate: { id: "cand-1", email: "candidate@example.com" },
        application: { id: "app-1" },
        job: { id: "job-1" },
        ai: null,
        trigger: triggerPayload,
      };

      const simResult = simulate({
        graph,
        trigger: triggerPayload,
        fixtures,
        virtualState: virtualContext,
        applyVirtualAction: (node, _input, outcome, state) => {
          if (node.actionType === "ai_score" && state) {
            const ctx = state as ConditionContext;
            ctx.ai = {
              ...(typeof outcome.output === "object" && outcome.output !== null
                ? (outcome.output as Record<string, unknown>)
                : {}),
            };
          }
        },
        evaluateCondition: (tree, state) =>
          evaluateConditions(
            tree,
            (state as ConditionContext) ?? virtualContext,
          ).matched,
      });

      expect(simResult.type).toBe("finished");
      if (simResult.type === "finished") {
        expect(simResult.result.status).toBe("succeeded");
        const executedNodeIds = simResult.trace.map((t) => t.nodeId);
        // Trace must traverse through trigger -> score_node -> condition_match -> delay_1h -> invite_email -> end_completed
        expect(executedNodeIds).toEqual(
          expect.arrayContaining([
            "trigger_node",
            "score_node",
            "condition_match",
            "delay_1h",
            "invite_email",
            "end_completed",
          ]),
        );
      }

      // 4. Test multi-scenario branch coverage
      const coverage = runBranchCoverageSimulation({
        graph,
        trigger: triggerPayload,
      });
      expect(coverage.status).toBe("verified");
      expect(coverage.allNodeIds).toHaveLength(6);
      expect(coverage.coveredNodeIds).toEqual(
        expect.arrayContaining([
          "score_node",
          "condition_match",
          "delay_1h",
          "invite_email",
        ]),
      );

      // 5. Test runtime execution and condition consumption
      const plan = compileValidGraph(graph);
      const snapshot: ExecutionSnapshot = {
        contentHash: plan.contentHash,
        nodeId: plan.entryNodeId,
        trigger: triggerPayload,
        outcomes: {},
        warnings: [],
        cancelled: false,
      };

      // Step 1: Trigger entry advances to score_node
      let decision = advance(plan, snapshot);
      expect(decision).toMatchObject({
        type: "next",
        nodeId: "score_node",
      });

      // At score_node, advance requests the action
      snapshot.nodeId = "score_node";
      decision = advance(plan, snapshot);
      expect(decision).toMatchObject({
        type: "action",
        node: expect.objectContaining({ actionType: "ai_score" }),
      });

      // Simulate successful runtime execution of ai_score
      snapshot.outcomes["score_node"] = {
        status: "succeeded",
        output: {
          applicationId: "app-1",
          score: 88,
          recommendation: "strong_yes",
          evaluationId: "eval-12345",
        },
      };

      // Advance from score_node to condition_match
      decision = advance(plan, snapshot);
      expect(decision).toMatchObject({
        type: "next",
        nodeId: "condition_match",
      });

      // At condition_match, advance requests condition evaluation
      snapshot.nodeId = "condition_match";
      decision = advance(plan, snapshot);
      expect(decision).toMatchObject({
        type: "condition",
        node: expect.objectContaining({ id: "condition_match" }),
      });

      // Condition evaluation consumes runtime context.ai produced by ai_score
      const runtimeContext: ConditionContext = {
        workspaceId,
        candidate: { id: "cand-1" },
        application: {
          id: "app-1",
          aiScore: 88,
          aiRecommendation: "strong_yes",
        },
        job: { id: "job-1" },
        ai: {
          score: 88,
          recommendation: "strong_yes",
          evaluationId: "eval-12345",
        },
        trigger: triggerPayload,
      };

      const conditionNode = graph.nodes.find(
        (node) => node.id === "condition_match" && node.type === "condition",
      );
      expect(conditionNode).toBeDefined();
      if (!conditionNode || conditionNode.type !== "condition") return;
      const condTree = conditionNode.tree;
      const condEval = evaluateConditions(condTree, runtimeContext);
      expect(condEval.matched).toBe(true); // 88 >= 80

      snapshot.outcomes["condition_match"] = {
        status: "succeeded",
        output: { matched: true },
        port: "true",
      };

      // Step 3: Advance condition_match (port true) -> delay_1h
      decision = advance(plan, snapshot);
      expect(decision).toMatchObject({
        type: "next",
        nodeId: "delay_1h",
      });

      // At delay_1h, advance requests wait
      snapshot.nodeId = "delay_1h";
      decision = advance(plan, snapshot);
      expect(decision).toMatchObject({
        type: "wait",
        node: expect.objectContaining({
          id: "delay_1h",
          mode: "duration",
          durationMs: 3600000,
        }),
      });

      snapshot.outcomes["delay_1h"] = {
        status: "succeeded",
        output: { elapsed: true },
        port: "elapsed",
      };

      // Step 4: Advance delay_1h -> invite_email
      decision = advance(plan, snapshot);
      expect(decision).toMatchObject({
        type: "next",
        nodeId: "invite_email",
      });

      // At invite_email, advance requests action
      snapshot.nodeId = "invite_email";
      decision = advance(plan, snapshot);
      expect(decision).toMatchObject({
        type: "action",
        node: expect.objectContaining({ actionType: "send_email" }),
      });

      snapshot.outcomes["invite_email"] = {
        status: "succeeded",
        output: { queued: true, outboxId: "outbox-1" },
        port: "success",
      };

      // Step 5: Advance invite_email -> end_completed
      decision = advance(plan, snapshot);
      expect(decision).toMatchObject({
        type: "next",
        nodeId: "end_completed",
      });

      // At end_completed, advance finishes workflow as succeeded
      snapshot.nodeId = "end_completed";
      decision = advance(plan, snapshot);
      expect(decision).toMatchObject({
        type: "finish",
        status: "succeeded",
      });
    });
  });

  describe("Scenario 2: Automatic applicant evaluation before contact", () => {
    const userPrompt =
      "I want promising applicants to be evaluated automatically before we contact them.";

    it("understands natural intent and identifies ai_score as the solution", () => {
      const intent = classifyHarlyIntent(userPrompt);
      expect(intent).toBe("automation_build");

      // Verify product knowledge explicitly confirms ai_score workflow capability
      const coreKnowledge = getHarlyCoreProductContext();
      expect(coreKnowledge).toContain("AI candidate evaluation");
      expect(coreKnowledge).toContain("ai_score");
    });

    it("evaluates candidate scoring output and prevents automatic contact when match is low", async () => {
      // Graph: trigger -> ai_score -> condition (score >= 70) -> send_email -> end_completed
      //                                      (false)       -> end_completed
      const graph: WorkflowGraphV2 = {
        schemaVersion: 2,
        entryNodeId: "trig",
        nodes: [
          {
            id: "trig",
            type: "trigger",
            event: "application.created",
            filter: {},
          },
          {
            id: "eval_cand",
            type: "action",
            actionType: "ai_score",
            toolVersion: 1,
            failurePolicy: "stop",
            input: {},
          },
          {
            id: "check_promising",
            type: "condition",
            tree: [
              {
                type: "leaf",
                field: { kind: "ai", path: "score" },
                op: "gte",
                value: 70,
              },
            ],
          },
          {
            id: "contact_cand",
            type: "action",
            actionType: "send_email",
            toolVersion: 1,
            failurePolicy: "stop",
            input: {
              subject: { kind: "literal", value: "Interview Invitation" },
              body: {
                kind: "literal",
                value: "Hello, we would like to interview you.",
              },
            },
          },
          {
            id: "end_completed",
            type: "end",
            result: "completed",
          },
        ],
        edges: [
          { id: "e1", source: "trig", port: "next", target: "eval_cand" },
          {
            id: "e2",
            source: "eval_cand",
            port: "success",
            target: "check_promising",
          },
          {
            id: "e3",
            source: "check_promising",
            port: "true",
            target: "contact_cand",
          },
          {
            id: "e4",
            source: "check_promising",
            port: "false",
            target: "end_completed",
          },
          {
            id: "e5",
            source: "contact_cand",
            port: "success",
            target: "end_completed",
          },
        ],
      };

      expect(
        validateGraphForPublish(
          { name: "Screen applicants", graph },
          getAutomationTool,
        ),
      ).toEqual([]);

      const plan = compileValidGraph(graph);

      // Case A: Candidate is weak (score = 45 < 70)
      const weakSnapshot: ExecutionSnapshot = {
        contentHash: plan.contentHash,
        nodeId: "eval_cand",
        trigger: { applicationId: "app-weak" },
        outcomes: {
          eval_cand: {
            status: "succeeded",
            output: {
              applicationId: "app-weak",
              score: 45,
              recommendation: "no",
            },
          },
        },
        warnings: [],
        cancelled: false,
      };

      const weakContext: ConditionContext = {
        workspaceId,
        candidate: null,
        application: { id: "app-weak" },
        job: null,
        ai: { score: 45, recommendation: "no" },
        trigger: { applicationId: "app-weak" },
      };

      const conditionNode = graph.nodes.find(
        (node) => node.id === "check_promising" && node.type === "condition",
      );
      expect(conditionNode).toBeDefined();
      if (!conditionNode || conditionNode.type !== "condition") return;
      const condTree = conditionNode.tree;
      const weakCondition = evaluateConditions(condTree, weakContext);
      expect(weakCondition.matched).toBe(false); // 45 < 70

      weakSnapshot.outcomes["check_promising"] = {
        status: "succeeded",
        output: { matched: false },
        port: "false",
      };

      // Advance from eval_cand to check_promising
      const nextDecision = advance(plan, weakSnapshot);
      expect(nextDecision).toMatchObject({
        type: "next",
        nodeId: "check_promising",
      });

      // At check_promising with matched: false, advance routes through false port to end_completed
      const falseDecision = advance(plan, {
        ...weakSnapshot,
        nodeId: "check_promising",
      });
      expect(falseDecision).toMatchObject({
        type: "next",
        nodeId: "end_completed",
      });
      expect(weakSnapshot.outcomes["contact_cand"]).toBeUndefined();

      // Case B: Candidate is promising (score = 92 >= 70)
      const strongContext: ConditionContext = {
        workspaceId,
        candidate: null,
        application: { id: "app-strong" },
        job: null,
        ai: { score: 92, recommendation: "strong_yes" },
        trigger: { applicationId: "app-strong" },
      };

      const strongCondition = evaluateConditions(condTree, strongContext);
      expect(strongCondition.matched).toBe(true); // 92 >= 70
    });
  });

  describe("Scenario 3: Upgrading an existing workflow with candidate evaluation", () => {
    const userPrompt =
      "Can you make this workflow smarter? I'd like Harly to evaluate the candidate before deciding whether they should continue.";

    it("inspects existing draft context and constructs an augmented graph proposal", () => {
      expect(classifyHarlyIntent(userPrompt)).toBe("automation_build");
      // Baseline draft before upgrade: trigger -> move_stage -> end
      const existingDraft: WorkflowGraphV2 = {
        schemaVersion: 2,
        entryNodeId: "trig",
        nodes: [
          {
            id: "trig",
            type: "trigger",
            event: "application.created",
            filter: {},
          },
          {
            id: "advance_stage",
            type: "action",
            actionType: "move_stage",
            toolVersion: 1,
            failurePolicy: "stop",
            input: {
              toStageId: { kind: "literal", value: "stage-interview-1" },
            },
          },
          {
            id: "end_done",
            type: "end",
            result: "completed",
          },
        ],
        edges: [
          { id: "e1", source: "trig", port: "next", target: "advance_stage" },
          {
            id: "e2",
            source: "advance_stage",
            port: "success",
            target: "end_done",
          },
        ],
      };

      // Upgraded draft: trigger -> ai_score -> condition (ai.score >= 75) -> move_stage -> end_done
      //                                      (false)                     -> end_done
      const upgradedDraft: WorkflowGraphV2 = {
        schemaVersion: 2,
        entryNodeId: "trig",
        nodes: [
          existingDraft.nodes[0]!,
          {
            id: "ai_score_step",
            type: "action",
            name: "AI Candidate Evaluation",
            actionType: "ai_score",
            toolVersion: 1,
            failurePolicy: "stop",
            input: {},
          },
          {
            id: "check_score",
            type: "condition",
            name: "Meets score threshold",
            tree: [
              {
                type: "leaf",
                field: { kind: "ai", path: "score" },
                op: "gte",
                value: 75,
              },
            ],
          },
          existingDraft.nodes[1]!,
          existingDraft.nodes[2]!,
        ],
        edges: [
          {
            id: "e_new_1",
            source: "trig",
            port: "next",
            target: "ai_score_step",
          },
          {
            id: "e_new_2",
            source: "ai_score_step",
            port: "success",
            target: "check_score",
          },
          {
            id: "e_new_3",
            source: "check_score",
            port: "true",
            target: "advance_stage",
          },
          {
            id: "e_new_4",
            source: "check_score",
            port: "false",
            target: "end_done",
          },
          {
            id: "e_new_5",
            source: "advance_stage",
            port: "success",
            target: "end_done",
          },
        ],
      };

      const issues = validateGraphForPublish(
        { name: "Smart Application Screening", graph: upgradedDraft },
        getAutomationTool,
      );
      expect(issues).toEqual([]);

      // Verify that downstream action can safely bind to ai_score's output
      const plan = compileValidGraph(upgradedDraft);
      const snapshot: ExecutionSnapshot = {
        contentHash: plan.contentHash,
        nodeId: "advance_stage",
        trigger: { applicationId: "app-101" },
        outcomes: {
          ai_score_step: {
            status: "succeeded",
            output: {
              applicationId: "app-101",
              score: 82,
              recommendation: "yes",
              evaluationId: "eval-999",
            },
          },
        },
        warnings: [],
        cancelled: false,
      };

      const resolvedScore = resolveBinding(
        { kind: "output", nodeId: "ai_score_step", path: "score" },
        snapshot,
        plan,
      );
      expect(resolvedScore).toBe(82);

      const resolvedRec = resolveBinding(
        { kind: "output", nodeId: "ai_score_step", path: "recommendation" },
        snapshot,
        plan,
      );
      expect(resolvedRec).toBe("yes");
    });
  });

  describe("Failsafe & Policy Enforcement", () => {
    it("ai_score handler fails cleanly when no application ID is provided in trigger or input", async () => {
      const handler = ACTION_REGISTRY.ai_score;
      expect(handler).toBeDefined();

      const result = await handler!.run(
        {},
        {
          workspaceId,
          actorUserId: userId,
          triggerEvent: "application.created",
          triggerPayload: {}, // empty payload, no applicationId
          effectKey: "test-effect",
          runId: "run-test",
          signal: new AbortController().signal,
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "No application in trigger payload or target",
      );
    });

    it("condition evaluation safely returns false when ai context is missing (no false positives)", () => {
      const emptyContext: ConditionContext = {
        workspaceId,
        candidate: null,
        application: null,
        job: null,
        ai: null,
        trigger: {},
      };

      const result = evaluateConditions(
        [
          {
            type: "leaf",
            field: { kind: "ai", path: "score" },
            op: "gte",
            value: 80,
          },
        ],
        emptyContext,
      );

      expect(result.matched).toBe(false);
    });

    it("verifies all user-facing tool labels and fallback formatters are strictly in English", () => {
      for (const label of Object.values(TOOL_LABELS)) {
        expect(label).not.toMatch(/[áéíóúñ¿¡]/i);
        expect(label).not.toMatch(
          /\b(revisando|consultando|buscando|preparando|evaluando)\b/i,
        );
      }

      expect(getToolLabel("tool-listAutomationTools")).toBe(
        "Checking automation tools",
      );
      expect(getToolLabel("tool-prepareAutomationPlan")).toBe(
        "Preparing automation plan",
      );
      expect(getToolLabel("tool-simulateAutomationProposal")).toBe(
        "Simulating automation",
      );
      expect(getToolLabel("tool-customSecurityScan")).toBe(
        "Checking custom security scan",
      );
    });
  });
});
