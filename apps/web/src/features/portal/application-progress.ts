/**
 * What a candidate sees about where their application stands: the step they
 * are on, how far along that is, and a plain-language line about what it
 * means. Pure, so the dashboard, the list and the detail page say the same
 * thing and it can be unit tested without a database.
 */

export type PortalApplicationStatus = "active" | "hired" | "rejected" | "withdrawn";

export type PortalStage = { id: string; name: string; order: number };

export type PortalProgressTone = "info" | "success" | "danger" | "neutral";

export type PortalApplicationProgress = {
  /** 1-based step of the current stage, or null when unknown or hidden. */
  step: number | null;
  total: number;
  currentStageName: string | null;
  tone: PortalProgressTone;
  /** Short status label for pills ("In review", "Hired"). */
  label: string;
  headline: string;
  body: string;
};

export function portalApplicationProgress(input: {
  stages: PortalStage[];
  currentStageId: string | null;
  status: PortalApplicationStatus;
  /** Workspace setting: when false, stage names stay private. */
  showStages: boolean;
  orgName?: string;
}): PortalApplicationProgress {
  const stages = input.showStages ? input.stages : [];
  const index = stages.findIndex((stage) => stage.id === input.currentStageId);
  const total = stages.length;
  const step = index >= 0 ? index + 1 : null;
  const currentStageName = index >= 0 ? stages[index]!.name : null;
  const org = input.orgName?.trim() || "The team";

  switch (input.status) {
    case "hired":
      return {
        step: total > 0 ? total : null,
        total,
        currentStageName,
        tone: "success",
        label: "Hired",
        headline: "You're hired",
        body: `Congratulations. ${org} will be in touch about your start date and onboarding.`,
      };
    case "rejected":
      return {
        step,
        total,
        currentStageName,
        tone: "danger",
        label: "Not selected",
        headline: "Not moving forward",
        body: `Thank you for your time. ${org} decided not to continue with this application. Your profile stays on file for future roles.`,
      };
    case "withdrawn":
      return {
        step,
        total,
        currentStageName,
        tone: "neutral",
        label: "Withdrawn",
        headline: "Application withdrawn",
        body: "This application is closed. You can still apply to other open roles.",
      };
    default:
      break;
  }

  if (!currentStageName || step === null) {
    return {
      step: null,
      total,
      currentStageName: null,
      tone: "info",
      label: "In review",
      headline: "In review",
      body: `${org} has your application. You'll hear back here and by email when there's an update.`,
    };
  }

  return {
    step,
    total,
    currentStageName,
    tone: "info",
    label: "In progress",
    headline: currentStageName,
    body:
      step === 1
        ? `${org} has your application and is reviewing it. You'll hear back here and by email.`
        : `You're at step ${step} of ${total}. ${org} will reach out with next steps.`,
  };
}
