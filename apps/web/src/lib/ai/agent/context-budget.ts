/**
 * Context budget for the Harly AI chat route: what the model re-reads on every
 * step. Tool results and earlier turns are replayed in full on every provider
 * call of a multi-step turn, so their size multiplies by the step count.
 *
 * Everything here only shapes the MODEL input. The UI stream and the persisted
 * conversation keep the raw messages and results.
 */

/** Turns (a user message and the replies after it) kept as they were sent. */
export const RECENT_TURNS_VERBATIM = 8;
/** Of those, the newest turns whose tool results are replayed in full. */
export const RECENT_TURNS_WITH_TOOL_PAYLOADS = 2;
/** Upper bound for one read tool result as the model sees it. */
export const MAX_TOOL_OUTPUT_CHARS = 6_000;
/** Older tool results/inputs become an abbreviated stub of at most this size. */
const STALE_TOOL_PAYLOAD_CHARS = 700;
/** Text of turns older than RECENT_TURNS_VERBATIM is clipped to this length. */
const OLD_TEXT_CHARS = 600;

export const STALE_TOOL_RESULT_NOTE =
  "Earlier-turn result, abbreviated. Call the tool again for current data before relying on it.";

type CompactLimits = { maxString: number; maxArray: number; maxDepth: number };

const COMPACTION_TIERS: readonly CompactLimits[] = [
  { maxString: 900, maxArray: 25, maxDepth: 8 },
  { maxString: 400, maxArray: 12, maxDepth: 6 },
  { maxString: 200, maxArray: 6, maxDepth: 5 },
  { maxString: 100, maxArray: 3, maxDepth: 4 },
];

function size(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Structure-preserving shrink: long strings are clipped and long arrays keep
 * their first items plus a "…N more" marker. Keys (and therefore ids) are kept,
 * so follow-up tool calls still resolve.
 */
export function compactJson(value: unknown, limits: CompactLimits, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > limits.maxString
      ? `${value.slice(0, limits.maxString)}… [${value.length - limits.maxString} chars omitted]`
      : value;
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= limits.maxDepth) return Array.isArray(value) ? `[${value.length} items]` : "{…}";
  if (Array.isArray(value)) {
    const kept = value
      .slice(0, limits.maxArray)
      .map((item) => compactJson(item, limits, depth + 1));
    if (value.length > limits.maxArray) kept.push(`… ${value.length - limits.maxArray} more`);
    return kept;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined) continue;
    out[key] = compactJson(item, limits, depth + 1);
  }
  return out;
}

/**
 * Shrinks a tool result until it fits `budget` characters of JSON, trying
 * progressively tighter tiers. Results already under budget are returned
 * unchanged (same reference).
 */
export function compactToolOutput(output: unknown, budget = MAX_TOOL_OUTPUT_CHARS): unknown {
  if (size(output) <= budget) return output;
  let compacted: unknown = output;
  for (const tier of COMPACTION_TIERS) {
    compacted = compactJson(output, tier);
    if (size(compacted) <= budget) return compacted;
  }
  if (compacted && typeof compacted === "object" && !Array.isArray(compacted)) {
    return { ...(compacted as Record<string, unknown>), _truncated: true };
  }
  return { _truncated: true, preview: JSON.stringify(compacted).slice(0, budget) };
}

type ToolLike = {
  execute?: (...args: never[]) => unknown;
  toModelOutput?: (options: { toolCallId: string; input: unknown; output: unknown }) => unknown;
};

/**
 * Caps every server-executed tool's result as the model sees it. Tools in
 * `exempt` (automation proposals carry hashes/graphs the model must pass back
 * verbatim) and client-confirmed write tools (no `execute`) are left alone.
 *
 * Apply BEFORE `withToolResultRedaction`: redaction then runs on the full
 * result and hands the redacted value to this hook, so compaction can only
 * remove redacted data, never reintroduce raw data.
 */
export function withCompactToolOutputs<T extends Record<string, unknown>>(
  tools: T,
  exempt: ReadonlySet<string>,
): T {
  const out = {} as Record<string, unknown>;
  for (const [name, value] of Object.entries(tools)) {
    const tool = value as ToolLike;
    if (exempt.has(name) || typeof tool?.execute !== "function") {
      out[name] = value;
      continue;
    }
    const original = tool.toModelOutput;
    out[name] = {
      ...(value as object),
      toModelOutput: (options: { toolCallId: string; input: unknown; output: unknown }) => {
        const output = compactToolOutput(options.output);
        if (original) return original({ ...options, output });
        return typeof output === "string"
          ? { type: "text", value: output }
          : { type: "json", value: output === undefined ? null : output };
      },
    };
  }
  return out as T;
}

type PartLike = { type: string; [key: string]: unknown };
type MessageLike = { role: string; parts: PartLike[] };

function isToolPart(part: PartLike): boolean {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

function staleStub(value: unknown): unknown {
  const compacted = compactToolOutput(value, STALE_TOOL_PAYLOAD_CHARS);
  if (compacted && typeof compacted === "object" && !Array.isArray(compacted)) {
    return { ...(compacted as Record<string, unknown>), _note: STALE_TOOL_RESULT_NOTE };
  }
  return { value: compacted, _note: STALE_TOOL_RESULT_NOTE };
}

/**
 * Bounds the replayed history:
 * - the newest `RECENT_TURNS_WITH_TOOL_PAYLOADS` turns are untouched;
 * - older turns within `RECENT_TURNS_VERBATIM` keep their text and tool calls,
 *   with tool inputs/results abbreviated to a small stub;
 * - turns older than that keep only clipped text (tool parts dropped whole, so
 *   no call is left without its result).
 */
export function compactHistoryForModel<M extends MessageLike>(
  messages: M[],
  options: { verbatimTurns?: number; payloadTurns?: number } = {},
): M[] {
  const verbatimTurns = options.verbatimTurns ?? RECENT_TURNS_VERBATIM;
  const payloadTurns = options.payloadTurns ?? RECENT_TURNS_WITH_TOOL_PAYLOADS;

  // Turn index counted from the end: the newest user message starts turn 0.
  const turnFromEnd: number[] = new Array(messages.length);
  let turn = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    turnFromEnd[index] = turn;
    if (messages[index]!.role === "user") turn += 1;
  }

  const out: M[] = [];
  messages.forEach((message, index) => {
    const age = turnFromEnd[index]!;
    if (age < payloadTurns) {
      out.push(message);
      return;
    }
    if (age < verbatimTurns) {
      out.push({
        ...message,
        parts: message.parts.map((part) => {
          if (!isToolPart(part)) return part;
          const next: PartLike = { ...part };
          if ("input" in part) next.input = compactToolOutput(part.input, STALE_TOOL_PAYLOAD_CHARS);
          if (part.state === "output-available" && "output" in part) {
            next.output = staleStub(part.output);
          }
          return next;
        }),
      });
      return;
    }
    const parts = message.parts
      .filter((part) => part.type === "text")
      .map((part) =>
        typeof part.text === "string" && part.text.length > OLD_TEXT_CHARS
          ? { ...part, text: `${part.text.slice(0, OLD_TEXT_CHARS)}…` }
          : part,
      );
    if (parts.length === 0) {
      if (message.role !== "user") return;
      parts.push({ type: "text", text: "[earlier message omitted]" });
    }
    out.push({ ...message, parts });
  });
  return out;
}
