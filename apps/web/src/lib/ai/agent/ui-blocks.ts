import "server-only";

import { tool } from "ai";

import { presentUiInputSchema } from "./ui-blocks-schema";

/**
 * `presentUi` renders interactive blocks in the chat panel. It has no side
 * effects: the client draws the blocks from the tool input, and the server
 * just acknowledges so the model can finish its turn. Any state change a
 * block offers is routed back through a chat message and the write tools'
 * confirmation flow (see ui-blocks-schema.ts).
 */
export function buildUiTools() {
  return {
    presentUi: tool({
      description:
        "Show the answer as interactive UI in the chat: candidate_list (people with stage and waiting days; row buttons open/score/move/reject/schedule/email), task_list, table, chart (bar|line), stat_tiles, choices (next-step buttons that send a message), form (collects details, then asks you to act), note. Use it instead of describing lists, numbers or options in prose. Use only ids and values you got from other tools; never invent them.",
      inputSchema: presentUiInputSchema,
      execute: async ({ blocks }) => ({ shown: blocks.length }),
    }),
  };
}
