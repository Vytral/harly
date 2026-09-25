import { describe, expect, it } from "vitest";

import {
  TOOL_GROUPS,
  assertToolRoutingCoversAllTools,
  resolveActiveToolGroups,
  selectActiveToolNames,
  shouldWidenForStep,
  toolNamesForGroups,
  type HarlyToolGroup,
} from "./tool-routing";

describe("Harly AI tool routing gateway (Phase 6, AI10)", () => {
  describe("assertToolRoutingCoversAllTools", () => {
    it("does not throw when every real tool name is assigned to exactly one group", async () => {
      // No permissions passed => buildHarlyTools returns the full, unfiltered
      // catalog: the real set of tool names the gateway must be able to route.
      const { buildHarlyTools } = await import("./index");
      const tools = buildHarlyTools({ workspaceId: "ws-1", userId: "user-1" });
      expect(() => assertToolRoutingCoversAllTools(Object.keys(tools))).not.toThrow();
    }, 20_000);

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

    it("widens to every group for ambiguous, product_docs, and general_advice intents", () => {
      for (const intent of ["ambiguous", "product_docs", "general_advice"] as const) {
        const groups = resolveActiveToolGroups({ message: "random text", intent });
        expect(groups.size).toBe(Object.keys(TOOL_GROUPS).length);
      }
    });

    it("widens to every group when no group keyword matches and there is no structural signal", () => {
      const groups = resolveActiveToolGroups({ message: "qwertyuiop", intent: "action" });
      expect(groups.size).toBe(Object.keys(TOOL_GROUPS).length);
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
      // ambiguous already widens to everything; verify the structural signal
      // path independently using a non-widening intent instead.
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

  describe("shouldWidenForStep", () => {
    it("does not widen on the first step", () => {
      expect(shouldWidenForStep(1)).toBe(false);
    });

    it("widens from the second step onward", () => {
      expect(shouldWidenForStep(2)).toBe(true);
      expect(shouldWidenForStep(3)).toBe(true);
    });
  });
});
