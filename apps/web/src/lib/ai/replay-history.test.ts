import { describe, expect, it } from "vitest";

import { withoutReplayedReasoning } from "./replay-history";

describe("withoutReplayedReasoning", () => {
  const history = [
    { role: "user", parts: [{ type: "text", text: "What needs my attention?" }] },
    {
      role: "assistant",
      parts: [
        { type: "reasoning", text: "thinking", providerMetadata: { openai: { itemId: "rs_1" } } },
        {
          type: "tool-hiringBrief",
          toolCallId: "call_1",
          callProviderMetadata: { openai: { itemId: "fc_1", other: "kept" } },
        },
        { type: "text", text: "Here you go", providerMetadata: { openai: { itemId: "msg_1" } } },
      ],
    },
  ];

  it("drops reasoning parts and the OpenAI item ids that reference them", () => {
    const [user, assistant] = withoutReplayedReasoning(history);
    expect(user).toBe(history[0]);
    expect(assistant.parts.map((part) => part.type)).toEqual(["tool-hiringBrief", "text"]);
    expect(assistant.parts[0]).toMatchObject({
      toolCallId: "call_1",
      callProviderMetadata: { openai: { other: "kept" } },
    });
    expect(JSON.stringify(assistant.parts)).not.toContain("itemId");
  });

  it("leaves parts without OpenAI metadata untouched", () => {
    const part = { type: "text", text: "hi", providerMetadata: { anthropic: { x: 1 } } };
    const [assistant] = withoutReplayedReasoning([{ role: "assistant", parts: [part] }]);
    expect(assistant.parts[0]).toBe(part);
  });
});
