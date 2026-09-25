export function portalInterviewStatusLabel(
  status: "scheduled" | "completed" | "canceled",
): "Scheduled" | "Completed" | "Canceled" {
  if (status === "completed") return "Completed";
  if (status === "canceled") return "Canceled";
  return "Scheduled";
}
