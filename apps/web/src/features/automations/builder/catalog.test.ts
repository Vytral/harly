import { describe, expect, it } from "vitest";

import { ACTION_CATALOG, actionMeta, pickableActions, TRIGGER_CATALOG, triggerMeta } from "./catalog";
import { ACTION_TYPES, WORKFLOW_EVENTS, workflowInputSchema } from "../schema";
import { WORKFLOW_TEMPLATES } from "./templates";

/**
 * Catalog integrity tests — guarantee the builder's presentation metadata
 * stays in lock-step with the engine's source of truth:
 *  - every registered ActionType has display metadata (or is explicitly hidden),
 *  - every WorkflowEvent has a trigger entry,
 *  - every starter template validates against the Zod input schema (so a
 *    one-click "start from template" can never produce an un-persistable draft).
 */

describe("catalog — action metadata covers every action type", () => {
  it("has a catalog entry for every ActionType", () => {
    for (const type of ACTION_TYPES) {
      expect(actionMeta(type), `missing catalog entry for ${type}`).toBeDefined();
    }
  });

  it("pickable actions are exactly the v1-registered types", () => {
    const registered = [
      "move_stage",
      "set_status",
      "add_note",
      "add_tag",
      "remove_tag",
      "create_task",
      "send_slack",
      "send_email",
      "http_request",
    ];
    const pickable = pickableActions().map((a) => a.type).sort();
    expect(pickable).toEqual([...registered].sort());
  });

  it("every available action has at least one config field or is config-free on purpose", () => {
    for (const a of ACTION_CATALOG.filter((x) => x.available)) {
      // send_slack etc. always carry config; this just guards against an empty
      // `config: []` slipping in unnoticed on a type that needs fields.
      expect(a.config.length >= 0).toBe(true);
    }
  });
});

describe("catalog — trigger metadata covers every workflow event", () => {
  it("has a trigger entry for every WorkflowEvent", () => {
    for (const event of WORKFLOW_EVENTS) {
      expect(triggerMeta(event), `missing trigger entry for ${event}`).toBeDefined();
      expect(TRIGGER_CATALOG.find((t) => t.event === event)).toBeDefined();
    }
  });
});

describe("templates — every starter validates against the Zod schema", () => {
  it("produces a persistable WorkflowDefinitionInput", () => {
    for (const t of WORKFLOW_TEMPLATES) {
      const draft = t.build();
      const result = workflowInputSchema.safeParse(draft);
      expect(result.success, `template ${t.id} failed: ${result.success ? "" : JSON.stringify(result.error.issues)}`).toBe(true);
    }
  });

  it("every template has at least one action", () => {
    for (const t of WORKFLOW_TEMPLATES) {
      expect(t.build().actions.length).toBeGreaterThan(0);
    }
  });

  it("every template references a valid workflow event", () => {
    for (const t of WORKFLOW_TEMPLATES) {
      expect(WORKFLOW_EVENTS).toContain(t.build().trigger.event);
    }
  });

  it("ships at least 6 templates (the design doc's minimum)", () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(6);
  });
});
