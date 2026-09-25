export type PipelineApplicationStatus =
  | "active"
  | "hired"
  | "rejected"
  | "withdrawn";

/**
 * Pipeline stages are the source of truth for active/terminal placement.
 * Custom stages remain active; the default terminal stages are recognized
 * case-insensitively so state changes are consistent across all entry points.
 */
export function statusForStageName(
  stageName: string,
): PipelineApplicationStatus {
  const normalized = stageName.trim().toLowerCase();
  if (normalized === "hired") return "hired";
  if (normalized === "rejected") return "rejected";
  if (normalized === "withdrawn") return "withdrawn";
  return "active";
}

export function terminalStageNameForStatus(
  status: PipelineApplicationStatus,
) {
  if (status === "hired") return "Hired";
  if (status === "rejected") return "Rejected";
  if (status === "withdrawn") return "Withdrawn";
  return null;
}
