import type { useTranslations } from "next-intl";

type Translator = ReturnType<typeof useTranslations>;

/** Copy for the ConfirmDialog version of the bulk hire or reject prompt. */
export function bulkDecisionConfirmCopy(
  t: Translator,
  status: "hired" | "rejected",
  count: number,
) {
  const hire = status === "hired";
  return {
    tone: hire ? ("default" as const) : ("destructive" as const),
    title: hire ? t("hireTitle", { count }) : t("rejectTitle", { count }),
    description: hire
      ? t("hireDescription", { count })
      : t("rejectDescription", { count }),
    confirmLabel: hire ? t("hireConfirm", { count }) : t("rejectConfirm", { count }),
  };
}
