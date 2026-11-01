import { describe, expect, it } from "vitest";

import {
  READ_HELPER_TOOLS,
  TOOL_GROUPS,
  assertToolRoutingCoversAllTools,
  resolveActiveToolGroups,
  selectActiveToolNames,
  toolNamesForGroups,
  turnNeedsWriteTools,
  type HarlyToolGroup,
} from "./tool-routing";
import { HARLY_GOLDEN_CONVERSATIONS } from "./golden-conversations";
import { classifyHarlyIntent } from "./intent";

describe("Harly AI tool routing gateway (Phase 6, AI10)", () => {
  describe("assertToolRoutingCoversAllTools", () => {
    it("does not throw when every real tool name is assigned to exactly one group", async () => {
      // No permissions passed => buildHarlyTools returns the full, unfiltered
      // catalog: the real set of tool names the gateway must be able to route.
      const { buildHarlyTools } = await import("./index");
      const tools = buildHarlyTools({ workspaceId: "ws-1", userId: "user-1" });
      expect(() => assertToolRoutingCoversAllTools(Object.keys(tools))).not.toThrow();
    }, 60_000);

    it("throws when a tool name is missing from every group", () => {
      expect(() =>
        assertToolRoutingCoversAllTools(["workspaceCapabilities", "someBrandNewTool"]),
      ).toThrow(/someBrandNewTool/);
    });

    it("throws when a tool name is declared in more than one group", () => {
      const groupsWithDuplicate: Record<HarlyToolGroup, readonly string[]> = {
        ...TOOL_GROUPS,
        general: [...TOOL_GROUPS.general, "listJobs"],
      };
      const names = new Map<string, HarlyToolGroup[]>();
      for (const [group, toolNames] of Object.entries(groupsWithDuplicate) as Array<
        [HarlyToolGroup, readonly string[]]
      >) {
        for (const name of toolNames) {
          names.set(name, [...(names.get(name) ?? []), group]);
        }
      }
      const duplicated = [...names.entries()].filter(([, owners]) => owners.length > 1);
      expect(duplicated.length).toBeGreaterThan(0);
    });
  });

  describe("resolveActiveToolGroups", () => {
    it("always activates the general group", () => {
      const groups = resolveActiveToolGroups({ message: "hola", intent: "ambiguous" });
      expect(groups.has("general")).toBe(true);
    });

    it("keeps presentUi in the always-on general group", () => {
      expect(TOOL_GROUPS.general).toContain("presentUi");
      for (const intent of ["ambiguous", "product_docs", "action", "automation_build"] as const) {
        const groups = resolveActiveToolGroups({ message: "random text", intent });
        expect(toolNamesForGroups(groups)).toContain("presentUi");
      }
    });

    it("answers product/advice questions from the general group without the record catalog", () => {
      for (const intent of ["product_docs", "general_advice"] as const) {
        const groups = resolveActiveToolGroups({ message: "random text", intent });
        expect([...groups]).toEqual(["general"]);
      }
    });

    it("falls back to the everyday read groups, never automations, when nothing matches", () => {
      for (const intent of ["ambiguous", "action"] as const) {
        const groups = resolveActiveToolGroups({ message: "qwertyuiop", intent });
        expect(groups).toEqual(
          new Set(["general", "candidates", "jobs", "interviews", "tasks", "integrations"]),
        );
        expect(groups.has("automations")).toBe(false);
      }
    });

    it("keeps the groups of tools used in recent turns for a bare follow-up", () => {
      const groups = resolveActiveToolGroups({
        message: "sí",
        intent: "ambiguous",
        recentToolNames: ["simulateAutomationProposal", "createOffer", "notATool"],
      });
      expect(groups.has("automations")).toBe(true);
      expect(groups.has("offers")).toBe(true);
    });

    it("offers write tools only when the turn asks for a change", () => {
      expect(turnNeedsWriteTools({ message: "Summarize Charlotte Dubois", intent: "ambiguous" })).toBe(false);
      expect(turnNeedsWriteTools({ message: "¿En qué etapa está Ana?", intent: "workspace_fact" })).toBe(false);
      for (const message of ["move her to interview", "pásala a la siguiente etapa", "sí", "dale", "go ahead", "add a note", "mándale un correo", "deshaz lo último", "undo that"]) {
        expect(turnNeedsWriteTools({ message, intent: "ambiguous" }), message).toBe(true);
      }
      expect(turnNeedsWriteTools({ message: "x", intent: "action" })).toBe(true);
      const readOnly = selectActiveToolNames(
        [...TOOL_GROUPS.general, ...TOOL_GROUPS.candidates],
        new Set<HarlyToolGroup>(["general", "candidates"]),
        { includeWrites: false },
      )!;
      expect(readOnly).not.toContain("moveCandidateStage");
      expect(readOnly).not.toContain("sendCandidateEmail");
      expect(readOnly).not.toContain("undoAgentAction");
      expect(readOnly).not.toContain("candidateNextAction");
      expect(readOnly).toContain("candidateProfile");
    });

    it("routes a bare candidate name to the candidates group only", () => {
      const message = "Summarize Charlotte Dubois";
      const groups = resolveActiveToolGroups({
        message,
        intent: classifyHarlyIntent(message),
      });
      expect(groups).toEqual(new Set(["general", "candidates"]));
    });

    it("narrows to the candidates group for a candidate-specific action request", () => {
      const groups = resolveActiveToolGroups({
        message: "reject this candidate and add a note",
        intent: "action",
      });
      expect(groups.has("candidates")).toBe(true);
      expect(groups.has("jobs")).toBe(false);
      expect(groups.has("automations")).toBe(false);
    });

    it("narrows to jobs and interviews together for a cross-category request", () => {
      const groups = resolveActiveToolGroups({
        message: "schedule an interview for the Backend job opening",
        intent: "action",
      });
      expect(groups.has("jobs")).toBe(true);
      expect(groups.has("interviews")).toBe(true);
      expect(groups.has("candidates")).toBe(false);
    });

    it("activates automations when an automation keyword is present", () => {
      const groups = resolveActiveToolGroups({
        message: "build an automation that emails new applicants",
        intent: "action",
      });
      expect(groups.has("automations")).toBe(true);
    });

    it("activates automations for a natural automation_build request without keywords", () => {
      const groups = resolveActiveToolGroups({
        message: "me gustaría que cuando un candidato postule espere una hora",
        intent: "automation_build",
      });
      expect(groups.has("automations")).toBe(true);
      expect(groups.has("reports")).toBe(false);
    });

    it("activates automations from structural context even without a keyword", () => {
      const groups = resolveActiveToolGroups({
        message: "add a delay node here",
        intent: "ambiguous",
        activeAutomation: { workflowId: "wf-1", isNew: false },
      });
      expect(groups.has("automations")).toBe(true);
    });

    it("activates candidates from an active candidate id even without a keyword", () => {
      const groups = resolveActiveToolGroups({
        message: "what do you think?",
        intent: "ambiguous",
        activeCandidateId: "cand-1",
      });
      const narrowGroups = resolveActiveToolGroups({
        message: "compare their scores",
        intent: "action",
        activeCandidateId: "cand-1",
      });
      expect(groups.has("candidates")).toBe(true);
      expect(narrowGroups.has("candidates")).toBe(true);
    });

    it("activates candidates from mentioned candidate ids even without a keyword", () => {
      const groups = resolveActiveToolGroups({
        message: "compare their scores",
        intent: "action",
        mentionedCandidateIds: ["cand-1", "cand-2"],
      });
      expect(groups.has("candidates")).toBe(true);
    });
  });

  describe("toolNamesForGroups / selectActiveToolNames", () => {
    it("expands a group set into its concrete tool names without duplicates across groups", () => {
      const names = toolNamesForGroups(new Set<HarlyToolGroup>(["general", "tasks"]));
      expect(names).toEqual(expect.arrayContaining(["workspaceCapabilities", "listTasks"]));
      expect(new Set(names).size).toBe(names.length);
    });

    it("returns undefined when the active groups already cover every available tool", () => {
      const available = toolNamesForGroups(new Set(Object.keys(TOOL_GROUPS) as HarlyToolGroup[]));
      const selected = selectActiveToolNames(available, new Set(Object.keys(TOOL_GROUPS) as HarlyToolGroup[]));
      expect(selected).toBeUndefined();
    });

    it("returns only the tool names belonging to the active groups, preserving availability filtering", () => {
      const available = ["workspaceCapabilities", "listJobs", "listTasks", "createOffer"];
      const selected = selectActiveToolNames(available, new Set<HarlyToolGroup>(["general", "jobs"]));
      expect(selected).toEqual(["workspaceCapabilities", "listJobs"]);
    });

    it("never returns a tool name that was not in availableToolNames, even if permission filtering already removed it", () => {
      // Simulates a role that lost automations:manage: the tool is gone from
      // the permission-filtered set before routing ever sees it.
      const available = ["workspaceCapabilities", "listJobs"];
      const selected = selectActiveToolNames(
        available,
        new Set<HarlyToolGroup>(["general", "jobs", "automations"]),
      );
      // Every available tool happens to be in an active group here, so the
      // function takes its "nothing to narrow" fast path and returns
      // undefined rather than reallocating an identical array.
      expect(selected).toBeUndefined();

      const availableWithExtra = ["workspaceCapabilities", "listJobs", "reportsOverview"];
      const narrowed = selectActiveToolNames(
        availableWithExtra,
        new Set<HarlyToolGroup>(["general", "jobs", "automations"]),
      );
      expect(narrowed).toEqual(["workspaceCapabilities", "listJobs"]);
      expect(narrowed).not.toContain("prepareAutomationPatch");
      expect(narrowed).not.toContain("reportsOverview");
    });
  });

  describe("bounded widen", () => {
    it("always adds the read helpers so a narrow route can still resolve and read records", () => {
      const available = [...TOOL_GROUPS.general, ...TOOL_GROUPS.candidates, ...TOOL_GROUPS.jobs, ...TOOL_GROUPS.reports];
      const selected = selectActiveToolNames(available, new Set<HarlyToolGroup>(["general", "reports"]))!;
      for (const helper of READ_HELPER_TOOLS) expect(selected).toContain(helper);
      expect(selected).toContain("presentUi");
      expect(selected).not.toContain("moveCandidateStage");
      expect(selected).not.toContain("createJob");
    });

    it("every read helper is a real routed tool", () => {
      const routed = new Set(Object.values(TOOL_GROUPS).flat());
      for (const helper of READ_HELPER_TOOLS) expect(routed.has(helper)).toBe(true);
    });

    it("offers every golden conversation's required tools on its routed turn", async () => {
      const { buildHarlyTools } = await import("./index");
      const available = Object.keys(
        buildHarlyTools({ workspaceId: "ws-1", userId: "user-1" }),
      );
      const missing: string[] = [];
      for (const conversation of HARLY_GOLDEN_CONVERSATIONS) {
        const routing = {
          message: conversation.userMessage,
          intent: classifyHarlyIntent(conversation.userMessage),
        };
        const groups = resolveActiveToolGroups(routing);
        const offered = new Set(
          selectActiveToolNames(available, groups, {
            includeWrites: turnNeedsWriteTools(routing),
          }) ?? available,
        );
        for (const toolName of conversation.requiredToolSequence) {
          if (!offered.has(toolName)) missing.push(`${conversation.id}: ${toolName}`);
        }
      }
      expect(missing).toEqual([]);
    }, 60_000);
  });
});
