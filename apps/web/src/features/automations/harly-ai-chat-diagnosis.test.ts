import { describe, expect, it } from "vitest";

import { classifyHarlyIntent } from "@/lib/ai/agent/intent";
import {
  HARLY_PRODUCT_KNOWLEDGE,
  getHarlyCoreProductContext,
} from "@/lib/ai/knowledge/harly-product-knowledge";
import { TOOL_LABELS, getToolLabel } from "@/components/dashboard/HarlyAIPanel";
import {
  ACTION_REGISTRY,
  listAutomationToolManifests,
  registeredActionTypes,
} from "@/features/automations/registry";
import { ACTION_CATALOG } from "@/features/automations/builder/catalog";
import { WORKFLOW_EVENTS } from "@/features/automations/schema";
import { WEBHOOK_EVENTS } from "@/server/webhooks/events";

describe("Harly AI chat diagnosis and automations integration", () => {
  describe("P1: Natural intent classification without brittle regex routing", () => {
    it("classifies user requests into base domain intents cleanly", () => {
      // Regular workspace operations
      expect(classifyHarlyIntent("¿Cuál es el estado actual de mi puesto?")).toBe(
        "workspace_fact",
      );
      expect(classifyHarlyIntent("Mueve a Lucas a entrevista")).toBe("action");
      expect(classifyHarlyIntent("¿Cómo funciona Harly?")).toBe("product_docs");
      expect(classifyHarlyIntent("¿Puedes publicar este puesto en LinkedIn?")).toBe("capability");
      expect(classifyHarlyIntent("¿Qué buenas prácticas recomiendas?")).toBe("general_advice");
    });

    it("routes natural automation requests into the orchestration path", () => {
      const naturalRequest = "me gustaría que cuando un candidato postule, espere 1 hora y le envíe un email";
      const intent = classifyHarlyIntent(naturalRequest);
      expect(intent).toBe("automation_build");
    });
  });

  describe("P1: AI evaluation (ai_score) workflow capability", () => {
    it("registers ai_score in the workflow runtime registry", () => {
      expect(registeredActionTypes()).toContain("ai_score");
      expect(ACTION_REGISTRY.ai_score).toBeDefined();
    });

    it("marks ai_score as available in the builder action catalog", () => {
      const catalogEntry = ACTION_CATALOG.find((entry) => entry.type === "ai_score");
      expect(catalogEntry).toBeDefined();
      expect(catalogEntry?.available).toBe(true);
      expect(catalogEntry?.label).toBe("AI evaluation");
    });

    it("declares ai_score in tool manifests for automation tooling", () => {
      const manifests = listAutomationToolManifests();
      const manifest = manifests.find((m) => m.type === "ai_score");
      expect(manifest).toBeDefined();
      expect(manifest?.outputFields).toContain("score");
      expect(manifest?.outputFields).toContain("recommendation");
    });

    it("documents ai_score support in canonical product knowledge", () => {
      const entry = HARLY_PRODUCT_KNOWLEDGE.find(
        (e) => e.id === "harly-automations-ai-actions",
      );
      expect(entry).toBeDefined();
      expect(entry?.content).toContain("ai_score");
      expect(entry?.content).toContain("AI candidate evaluation");
      expect(entry?.content).toContain("IF ai.score >= 80");

      const core = getHarlyCoreProductContext();
      expect(core).toContain("AI evaluation and actions in automations");
      expect(core).toContain("ai_score");
    });

    it("exposes evaluation.completed as a workflow trigger, closing the original diagnosis gap", () => {
      // The original diagnosis found ai_score usable as a DO step but no
      // way to trigger a workflow the moment an evaluation finishes. Both
      // catalogs (outbound webhooks and workflow triggers) must agree.
      expect(WEBHOOK_EVENTS).toContain("evaluation.completed");
      expect(WORKFLOW_EVENTS).toContain("evaluation.completed");
    });
  });

  describe("P2: Tool labels and progress consolidation in English", () => {
    it("maps all automations tools to human-readable English labels", () => {
      expect(TOOL_LABELS["tool-listAutomationTools"]).toBe(
        "Checking automation tools",
      );
      expect(TOOL_LABELS["tool-searchAutomations"]).toBe(
        "Searching automations",
      );
      expect(TOOL_LABELS["tool-getAutomationContext"]).toBe(
        "Reading automation draft",
      );
      expect(TOOL_LABELS["tool-prepareAutomationPatch"]).toBe(
        "Preparing automation proposal",
      );
      expect(TOOL_LABELS["tool-simulateAutomationProposal"]).toBe(
        "Simulating automation",
      );
      expect(TOOL_LABELS["tool-applyAutomationProposal"]).toBe(
        "Applying automation changes",
      );
    });

    it("provides a clean English formatted fallback for unknown tools instead of raw Working", () => {
      expect(getToolLabel("tool-customValidationCheck")).toBe(
        "Checking custom validation check",
      );
      expect(getToolLabel("tool-arbitraryThirdPartySync")).toBe(
        "Checking arbitrary third party sync",
      );
      expect(getToolLabel("")).toBe("Working");
    });
  });
});
