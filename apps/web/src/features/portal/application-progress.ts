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

/**
 * `t` resolves keys under `labels.portal.applicationProgress`, so the same
 * helper works from server and client callers.
 */
export type PortalProgressTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export function portalApplicationProgress(
  input: {
    stages: PortalStage[];
    currentStageId: string | null;
    status: PortalApplicationStatus;
    /** Workspace setting: when false, stage names stay private. */
    showStages: boolean;
    orgName?: string;
  },
  t: PortalProgressTranslator,
): PortalApplicationProgress {
  const stages = input.showStages ? input.stages : [];
  const index = stages.findIndex((stage) => stage.id === input.currentStageId);
  const total = stages.length;
  const step = index >= 0 ? index + 1 : null;
  const currentStageName = index >= 0 ? stages[index]!.name : null;
  const org = input.orgName?.trim() || t("orgFallback");

  switch (input.status) {
    case "hired":
      return {
        step: total > 0 ? total : null,
        total,
        currentStageName,
        tone: "success",
        label: t("hiredLabel"),
        headline: t("hiredHeadline"),
        body: t("hiredBody", { org }),
      };
    case "rejected":
      return {
        step,
        total,
        currentStageName,
        tone: "danger",
        label: t("rejectedLabel"),
        headline: t("rejectedHeadline"),
        body: t("rejectedBody", { org }),
      };
    case "withdrawn":
      return {
        step,
        total,
        currentStageName,
        tone: "neutral",
        label: t("withdrawnLabel"),
        headline: t("withdrawnHeadline"),
        body: t("withdrawnBody"),
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
      label: t("reviewLabel"),
      headline: t("reviewLabel"),
      body: t("reviewBody", { org }),
    };
  }

  return {
    step,
    total,
    currentStageName,
    tone: "info",
    label: t("inProgressLabel"),
    headline: currentStageName,
    body:
      step === 1
        ? t("firstStepBody", { org })
        : t("laterStepBody", { step, total, org }),
  };
}
