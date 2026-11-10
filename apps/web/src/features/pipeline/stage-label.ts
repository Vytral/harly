/**
 * Translator for `labels.pipeline.stages`, or any function that resolves a
 * stage id to its label.
 */
export type StageLabelTranslator = (key: string) => string;

/**
 * Default stage names from `DEFAULT_PIPELINE_STAGES`, keyed by their lowercase
 * form. Each one has a label under `labels.pipeline.stages.<id>`.
 */
const DEFAULT_STAGE_IDS: ReadonlySet<string> = new Set([
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
]);

/**
 * Display label for a stage. A stage still carrying a default English name is
 * shown in the viewer's language. Customised names are returned unchanged.
 * Use this for display only, never for comparisons or stored values.
 */
export function stageLabel(name: string, t: StageLabelTranslator): string {
  const id = name.trim().toLowerCase();
  return DEFAULT_STAGE_IDS.has(id) ? t(id) : name;
}
