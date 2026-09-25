import { describe, expect, it } from "vitest";

import {
  BUILTIN_ROLE_PERMISSIONS,
  type Permission,
} from "@/features/workspaces/permissions";
import {
  AGENT_READ_TOOL_PERMISSIONS,
  AGENT_WRITE_TOOL_PERMISSIONS,
  isToolAllowed,
} from "./tool-permissions";
import { buildHarlyTools } from "./index";

describe("Harly AI Permission Alignment (Phase 0)", () => {
  const automationReadTools = [
    "listAutomationTools",
    "getAutomationContext",
    "getAutomationSubgraph",
    "searchAutomations",
    "resolveAutomationResources",
    "prepareAutomationPlan",
    "prepareAutomationPatch",
    "rebaseAutomationPatch",
    "simulateAutomationProposal",
    "queueAutomationSimulation",
    "getAutomationJob",
    "runBranchCoverage",
    "diagnoseWorkflowRun",
    "prepareAutomationRepair",
  ] as const;

  describe("Role permission definitions", () => {
    it("hiring_manager has collab:write but lacks automations:manage, offers:manage, and jobs:create", () => {
      const hmPerms = BUILTIN_ROLE_PERMISSIONS.hiring_manager;
      expect(hmPerms).toContain("collab:write");
      expect(hmPerms).not.toContain("automations:manage");
      expect(hmPerms).not.toContain("offers:manage");
      expect(hmPerms).not.toContain("jobs:create");
    });

    it("recruiter has both collab:write and automations:manage", () => {
      const recruiterPerms = BUILTIN_ROLE_PERMISSIONS.recruiter;
      expect(recruiterPerms).toContain("collab:write");
      expect(recruiterPerms).toContain("automations:manage");
      expect(recruiterPerms).toContain("offers:manage");
    });
  });

  describe("Tool permission catalog and isToolAllowed", () => {
    it("assigns automations:manage to every automation read tool and the apply write tool", () => {
      for (const toolName of automationReadTools) {
        expect(AGENT_READ_TOOL_PERMISSIONS[toolName]).toBe("automations:manage");
      }
      expect(AGENT_WRITE_TOOL_PERMISSIONS.applyAutomationProposal).toBe("automations:manage");
    });

    it("disallows automation tools for hiring_manager role", () => {
      const hmPerms = BUILTIN_ROLE_PERMISSIONS.hiring_manager;
      for (const toolName of automationReadTools) {
        expect(isToolAllowed(toolName, hmPerms)).toBe(false);
      }
      expect(isToolAllowed("applyAutomationProposal", hmPerms)).toBe(false);
    });

    it("allows automation tools for recruiter and admin roles", () => {
      const recruiterPerms = BUILTIN_ROLE_PERMISSIONS.recruiter;
      for (const toolName of automationReadTools) {
        expect(isToolAllowed(toolName, recruiterPerms)).toBe(true);
      }
      expect(isToolAllowed("applyAutomationProposal", recruiterPerms)).toBe(true);
    });

    it("disallows offers:manage write tools for hiring_manager", () => {
      const hmPerms = BUILTIN_ROLE_PERMISSIONS.hiring_manager;
      expect(isToolAllowed("createOffer", hmPerms)).toBe(false);
      expect(isToolAllowed("sendOffer", hmPerms)).toBe(false);
      expect(isToolAllowed("decideOffer", hmPerms)).toBe(false);
    });

    it("allows basic candidate viewing and collaboration tools for hiring_manager", () => {
      const hmPerms = BUILTIN_ROLE_PERMISSIONS.hiring_manager;
      expect(isToolAllowed("listCandidates", hmPerms)).toBe(true);
      expect(isToolAllowed("candidateProfile", hmPerms)).toBe(true);
      expect(isToolAllowed("addCandidateNote", hmPerms)).toBe(true);
      expect(isToolAllowed("submitScorecard", hmPerms)).toBe(true);
      expect(isToolAllowed("moveCandidateStage", hmPerms)).toBe(true);
    });
  });

  describe("buildHarlyTools dynamic filtering", () => {
    it("strips unauthorized tools when constructed for a hiring_manager", () => {
      const hmTools = buildHarlyTools({
        workspaceId: "ws-test",
        userId: "user-hm",
        permissions: BUILTIN_ROLE_PERMISSIONS.hiring_manager,
      });

      // Automation tools must be completely hidden from the model
      for (const toolName of automationReadTools) {
        expect(hmTools).not.toHaveProperty(toolName);
      }
      expect(hmTools).not.toHaveProperty("applyAutomationProposal");

      // Offers must be completely hidden
      expect(hmTools).not.toHaveProperty("createOffer");
      expect(hmTools).not.toHaveProperty("listCandidateOffers");

      // Allowed tools must be present
      expect(hmTools).toHaveProperty("listCandidates");
      expect(hmTools).toHaveProperty("candidateProfile");
      expect(hmTools).toHaveProperty("addCandidateNote");
      expect(hmTools).toHaveProperty("createTask");
      expect(hmTools).toHaveProperty("moveCandidateStage");
    });

    it("includes automation tools when constructed for a recruiter", () => {
      const recruiterTools = buildHarlyTools({
        workspaceId: "ws-test",
        userId: "user-recruiter",
        permissions: BUILTIN_ROLE_PERMISSIONS.recruiter,
      });

      for (const toolName of automationReadTools) {
        expect(recruiterTools).toHaveProperty(toolName);
      }
      expect(recruiterTools).toHaveProperty("applyAutomationProposal");
      expect(recruiterTools).toHaveProperty("createOffer");
    });

    it("respects custom role permissions without leaks", () => {
      const customPerms: Permission[] = ["collab:write", "tasks:read", "tasks:write"];
      const customTools = buildHarlyTools({
        workspaceId: "ws-test",
        userId: "user-custom",
        permissions: customPerms,
      });

      expect(customTools).not.toHaveProperty("listAutomationTools");
      expect(customTools).not.toHaveProperty("applyAutomationProposal");
      expect(customTools).not.toHaveProperty("listCandidates");
      expect(customTools).not.toHaveProperty("moveCandidateStage");

      expect(customTools).toHaveProperty("listTasks");
      expect(customTools).toHaveProperty("createTask");
      expect(customTools).toHaveProperty("addCandidateNote");
    });
  });
});
