import { asSchema, type ModelMessage } from "ai";

/**
 * Dev-only prompt-size breakdown for the Harly AI chat route, enabled with
 * HARLY_AI_TOKEN_DEBUG=1. Token counts are estimates (characters / 4); they
 * exist to show which part of the request dominates, not to bill anything.
 */
export function isTokenDebugEnabled(): boolean {
  return process.env.HARLY_AI_TOKEN_DEBUG === "1";
}

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

type ToolDefinitionLike = { description?: string; inputSchema?: unknown };

export type ToolDefinitionsSize = {
  count: number;
  chars: number;
  tokens: number;
  largest: Array<{ name: string; chars: number }>;
};

/** Size of the tool definitions as sent: name + description + JSON schema. */
export async function measureToolDefinitions(
  tools: Record<string, unknown>,
  activeToolNames?: readonly string[],
): Promise<ToolDefinitionsSize> {
  const names = activeToolNames ?? Object.keys(tools);
  const sizes: Array<{ name: string; chars: number }> = [];
  for (const name of names) {
    const tool = tools[name] as ToolDefinitionLike | undefined;
    if (!tool) continue;
    let schemaChars = 0;
    try {
      schemaChars = JSON.stringify(
        await asSchema(tool.inputSchema as Parameters<typeof asSchema>[0]).jsonSchema,
      ).length;
    } catch {
      schemaChars = 0;
    }
    sizes.push({ name, chars: name.length + (tool.description?.length ?? 0) + schemaChars });
  }
  const chars = sizes.reduce((total, item) => total + item.chars, 0);
  return {
    count: sizes.length,
    chars,
    tokens: estimateTokens(chars),
    largest: [...sizes].sort((a, b) => b.chars - a.chars).slice(0, 5),
  };
}

export type MessagesSize = {
  count: number;
  textChars: number;
  toolCallChars: number;
  toolResultChars: number;
  tokens: number;
};

function partChars(part: unknown): { text: number; call: number; result: number } {
  if (!part || typeof part !== "object") return { text: 0, call: 0, result: 0 };
  const record = part as Record<string, unknown>;
  if (record.type === "tool-call") return { text: 0, call: JSON.stringify(record.input ?? {}).length, result: 0 };
  if (record.type === "tool-result") return { text: 0, call: 0, result: JSON.stringify(record.output ?? null).length };
  if (typeof record.text === "string") return { text: record.text.length, call: 0, result: 0 };
  return { text: JSON.stringify(record).length, call: 0, result: 0 };
}

export function measureMessages(messages: readonly ModelMessage[]): MessagesSize {
  let textChars = 0;
  let toolCallChars = 0;
  let toolResultChars = 0;
  for (const message of messages) {
    const parts = typeof message.content === "string" ? [{ text: message.content }] : message.content;
    for (const part of parts as unknown[]) {
      const sizes = partChars(part);
      textChars += sizes.text;
      toolCallChars += sizes.call;
      toolResultChars += sizes.result;
    }
  }
  return {
    count: messages.length,
    textChars,
    toolCallChars,
    toolResultChars,
    tokens: estimateTokens(textChars + toolCallChars + toolResultChars),
  };
}

export type PromptTokenBreakdown = {
  step: number;
  systemSections: Record<string, number>;
  systemTokens: number;
  tools: ToolDefinitionsSize;
  history: MessagesSize;
  stepToolResults: MessagesSize;
  totalTokens: number;
};

export function buildPromptTokenBreakdown(input: {
  step: number;
  systemSections: Record<string, string>;
  tools: ToolDefinitionsSize;
  messages: readonly ModelMessage[];
  /** How many of `messages` came from the conversation history (the rest are this turn's steps). */
  historyCount: number;
}): PromptTokenBreakdown {
  const systemSections = Object.fromEntries(
    Object.entries(input.systemSections).map(([key, text]) => [key, estimateTokens(text.length)]),
  );
  const systemTokens = Object.values(systemSections).reduce((total, tokens) => total + tokens, 0);
  const history = measureMessages(input.messages.slice(0, input.historyCount));
  const stepToolResults = measureMessages(input.messages.slice(input.historyCount));
  return {
    step: input.step,
    systemSections,
    systemTokens,
    tools: input.tools,
    history,
    stepToolResults,
    totalTokens: systemTokens + input.tools.tokens + history.tokens + stepToolResults.tokens,
  };
}

/** Splits a system prompt into its `# Heading` sections for the breakdown. */
export function systemPromptSections(prefix: string, text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const chunks = text.split(/\n(?=#{1,2} )/);
  chunks.forEach((chunk, index) => {
    const heading = /^#{1,2} (.+)/.exec(chunk)?.[1]?.trim() ?? `part ${index + 1}`;
    sections[`${prefix}:${heading}`] = chunk;
  });
  return sections;
}
