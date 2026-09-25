import { describe, expect, it } from "vitest";

import { emptyCanvasGraph } from "../definition/schema-v2";
import { createBlock } from "./state/blocks";
import { diffGraphSummaries, summarizeGraph } from "./graph-diff";

describe("conflict compare is human-readable", () => {
  it("describes steps that exist only on one copy", () => {
    const local = emptyCanvasGraph();
    const extra = createBlock("action", { actionType: "add_note" });
    extra.name = "Send welcome note";
    local.nodes.push(extra);
    const lines = diffGraphSummaries(summarizeGraph(local), summarizeGraph(emptyCanvasGraph()));
    expect(lines.some((line) => line.message.includes("Send welcome note"))).toBe(true);
    expect(lines.every((line) => !line.message.trim().startsWith("{"))).toBe(true);
  });
});
