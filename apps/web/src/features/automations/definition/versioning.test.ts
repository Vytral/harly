import { describe, expect, it } from "vitest";

import { semanticGraphHash } from "./hash";
import { graphToLegacy, legacyToGraph } from "./legacy-adapter";

const published = legacyToGraph({
  trigger: { event: "application.created" },
  conditions: [],
  actions: [{ type: "add_tag", config: { label: "new" }, continueOnError: false }],
});

describe("T08 — draft hash is independent of a published snapshot", () => {
  it("editing actions changes the draft hash without rewriting the published graph", () => {
    const publishedHash = semanticGraphHash(published);
    const draft = legacyToGraph({
      trigger: { event: "application.created" },
      conditions: [],
      actions: [{ type: "add_note", config: { body: "hello" }, continueOnError: false }],
    });
    expect(semanticGraphHash(draft)).not.toBe(publishedHash);
    expect(semanticGraphHash(published)).toBe(publishedHash);
    expect(graphToLegacy(published).actions[0]?.type).toBe("add_tag");
  });
});

describe("T09 — approval is bound to a content hash", () => {
  it("a later edit produces a different hash than the reviewed revision", () => {
    const reviewed = semanticGraphHash(published);
    const edited = legacyToGraph({
      trigger: { event: "application.created" },
      conditions: [],
      actions: [
        { type: "add_tag", config: { label: "new" }, continueOnError: false },
        { type: "create_task", config: { title: "Call" }, continueOnError: false },
      ],
    });
    expect(semanticGraphHash(edited)).not.toBe(reviewed);
  });
});
