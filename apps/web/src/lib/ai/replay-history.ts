/** History shaping before earlier chat turns are sent back to the model. */

/**
 * Earlier turns' reasoning ("thinking") parts are not sent back to the model.
 * Anthropic binds a thinking block's signature to the exact system prompt and
 * tool list of the turn that produced it; both change per turn here (surface
 * context, per-query tool routing), so replaying them fails the whole request
 * with a 400 ("block is bound to a different conversation"). The final text
 * and tool results already carry what the next turn needs.
 *
 * OpenAI's Responses API replays a part that carries an `openai.itemId` as a
 * reference to the stored item, and a reasoning model's stored function call
 * must arrive with its reasoning item ("provided without its required
 * 'reasoning' item"). With reasoning dropped, drop those item ids too so the
 * calls and text are sent inline instead.
 */
export function withoutReplayedReasoning<T extends { role: string; parts: Array<{ type: string }> }>(
  messages: T[],
): T[] {
  return messages.map((message) =>
    message.role === "assistant"
      ? {
          ...message,
          parts: message.parts
            .filter((part) => part.type !== "reasoning")
            .map((part) => withoutOpenAiItemId(part)),
        }
      : message,
  );
}

const PROVIDER_METADATA_KEYS = ["providerMetadata", "callProviderMetadata"] as const;

function withoutOpenAiItemId<P extends { type: string }>(part: P): P {
  let next: P = part;
  for (const key of PROVIDER_METADATA_KEYS) {
    const metadata = (next as Record<string, unknown>)[key] as
      | Record<string, Record<string, unknown> | undefined>
      | undefined;
    const openai = metadata?.openai;
    if (!openai || !("itemId" in openai)) continue;
    const rest = { ...openai };
    delete rest.itemId;
    next = { ...next, [key]: { ...metadata, openai: rest } };
  }
  return next;
}
