export function bulkDecisionConfirmationMessage(
  status: "hired" | "rejected",
  count: number,
) {
  const verb = status === "hired" ? "hire" : "reject";
  const noun = count === 1 ? "application" : "applications";
  return `Confirm ${verb} ${count} ${noun}? This changes every selected application.`;
}

/** Copy for the ConfirmDialog version of the same bulk-decision prompt. */
export function bulkDecisionConfirmCopy(
  status: "hired" | "rejected",
  count: number,
) {
  const noun = count === 1 ? "application" : "applications";
  const hire = status === "hired";
  return {
    tone: hire ? ("default" as const) : ("destructive" as const),
    title: `${hire ? "Hire" : "Reject"} ${count} ${noun}?`,
    description: hire
      ? `All ${count} selected ${noun} will be marked as hired.`
      : `All ${count} selected ${noun} will be marked as rejected. Candidates may be notified depending on your stage emails.`,
    confirmLabel: `${hire ? "Hire" : "Reject"} ${count} ${noun}`,
  };
}
