import { z } from "zod";

/**
 * Intelligent UI: the blocks Harly AI can show in a chat answer instead of
 * describing lists, numbers and choices in prose. Shared by the `presentUi`
 * tool (server) and the panel renderer (client), so both agree on the shape.
 *
 * Interaction model, deliberately safe:
 * - Links and checkboxes are ordinary UI actions the user takes directly.
 * - Anything that changes hiring state (score, move, reject, schedule, email)
 *   is sent back to the agent as a chat message, so it goes through the
 *   existing preview → confirm → undo write cards. No block mutates data on
 *   its own.
 */

const text = (max: number) => z.string().trim().min(1).max(max);

export const candidateRowSchema = z.object({
  candidateId: text(64),
  name: text(80),
  subtitle: text(120).optional().describe("Role or job, e.g. 'Backend Engineer (Go)'."),
  stage: text(40).optional(),
  waitingDays: z.number().int().min(0).max(3650).optional(),
  applicationId: text(64).optional(),
});

export const candidateActionSchema = z.enum(["open", "score", "move", "reject", "schedule", "email"]);

const candidateListBlock = z.object({
  kind: z.literal("candidate_list"),
  title: text(80).optional(),
  items: z.array(candidateRowSchema).min(1).max(12),
  actions: z.array(candidateActionSchema).max(3).optional().describe("Row buttons. 'open' is always available."),
});

const taskListBlock = z.object({
  kind: z.literal("task_list"),
  title: text(80).optional(),
  items: z
    .array(
      z.object({
        taskId: text(64).optional(),
        title: text(160),
        due: text(40).optional().describe("Human date, e.g. 'Today 10:00'."),
        done: z.boolean().optional(),
        href: text(200).optional(),
      }),
    )
    .min(1)
    .max(12),
});

const tableBlock = z.object({
  kind: z.literal("table"),
  title: text(80).optional(),
  columns: z.array(text(40)).min(2).max(6),
  rows: z.array(z.array(z.string().max(120)).min(1).max(6)).min(1).max(20),
});

const chartBlock = z.object({
  kind: z.literal("chart"),
  title: text(80).optional(),
  type: z.enum(["bar", "line"]),
  unit: text(16).optional(),
  data: z.array(z.object({ label: text(32), value: z.number() })).min(1).max(12),
});

const statTilesBlock = z.object({
  kind: z.literal("stat_tiles"),
  items: z.array(z.object({ label: text(40), value: text(24), hint: text(60).optional() })).min(1).max(4),
});

const choicesBlock = z.object({
  kind: z.literal("choices"),
  prompt: text(120).optional(),
  options: z
    .array(z.object({ label: text(40), message: text(240).describe("Sent as the user's next message when clicked.") }))
    .min(1)
    .max(4),
});

const formBlock = z.object({
  kind: z.literal("form"),
  title: text(80),
  intent: text(80).describe("What submitting asks you to do, e.g. 'Schedule an interview with Mei Tanaka'."),
  fields: z
    .array(
      z.object({
        name: text(32),
        label: text(40),
        type: z.enum(["text", "textarea", "date", "time", "select"]),
        options: z.array(text(60)).max(12).optional(),
        value: z.string().max(240).optional(),
        required: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(6),
  submitLabel: text(32),
});

const noteBlock = z.object({
  kind: z.literal("note"),
  tone: z.enum(["info", "warning", "success"]),
  text: text(240),
});

export const uiBlockSchema = z.discriminatedUnion("kind", [
  candidateListBlock,
  taskListBlock,
  tableBlock,
  chartBlock,
  statTilesBlock,
  choicesBlock,
  formBlock,
  noteBlock,
]);

export const presentUiInputSchema = z.object({
  blocks: z.array(uiBlockSchema).min(1).max(6),
});

export type UiBlock = z.infer<typeof uiBlockSchema>;
export type PresentUiInput = z.infer<typeof presentUiInputSchema>;
export type CandidateAction = z.infer<typeof candidateActionSchema>;

/**
 * Blocks safe to render from a presentUi input that may still be streaming.
 * The whole input fails validation while its JSON is incomplete, so parsing it
 * as one unit made the card vanish and reappear on almost every token (and
 * replay its entrance animation). Instead, render the leading blocks that are
 * already valid and let the one still arriving wait.
 */
export function renderableUiBlocks(input: unknown): UiBlock[] {
  const full = presentUiInputSchema.safeParse(input);
  if (full.success) return full.data.blocks;
  const raw = (input as { blocks?: unknown } | null | undefined)?.blocks;
  if (!Array.isArray(raw)) return [];
  const blocks: UiBlock[] = [];
  for (const candidate of raw.slice(0, 6)) {
    const parsed = uiBlockSchema.safeParse(candidate);
    if (!parsed.success) break;
    blocks.push(parsed.data);
  }
  return blocks;
}
