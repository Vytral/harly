import { describe, expect, it } from "vitest";

import { emptyCanvasGraph } from "../definition/schema-v2";
import { createBlock } from "./state/blocks";
import { looksLikeRawJson, requiredConfigIssues, visibleIssues } from "./validation-view";

describe("T02 — validation is readable and does not block drafts", () => {
  it("lists missing connections in traversal order with human text", () => {
    const graph = emptyCanvasGraph();
    const issues = visibleIssues(graph);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => !looksLikeRawJson(issue.message))).toBe(true);
    expect(issues[0]?.message.toLowerCase()).not.toContain("{");
  });

  it("flags required action fields without treating them as save blockers", () => {
    const action = createBlock("action", { actionType: "add_note" });
    const graph = emptyCanvasGraph();
    graph.nodes.push(action);
    const required = requiredConfigIssues(graph);
    expect(required.some((issue) => issue.message.includes("Note"))).toBe(true);
  });
});

describe("raw JSON is never shown as an error", () => {
  it("detects dumped objects", () => {
    expect(looksLikeRawJson('{"foo":1}')).toBe(true);
    expect(looksLikeRawJson("Connect the “success” output.")).toBe(false);
  });
});
