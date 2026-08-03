export function bulkDecisionConfirmationMessage(
  status: "hired" | "rejected",
  count: number,
) {
  const verb = status === "hired" ? "hire" : "reject";
  const noun = count === 1 ? "application" : "applications";
  return `Confirm ${verb} ${count} ${noun}? This changes every selected application.`;
}
