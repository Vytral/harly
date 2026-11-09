import type { useTranslations } from "next-intl";
import { z } from "zod";

/**
 * Rejection reasons — client-safe constants, types and validation.
 *
 * A reason is identified by a stable `code`. Workspaces start with the default
 * catalog below (seeded lazily on first use) and can rename, add or archive
 * reasons in Settings. The application stores the code; the label shown is the
 * catalog's current one, with the activity entry keeping a snapshot.
 */

export const DEFAULT_REJECTION_REASONS = [
  { code: "not_enough_experience", label: "Not enough experience" },
  { code: "skills_mismatch", label: "Skills mismatch" },
  { code: "salary_expectations", label: "Salary expectations" },
  { code: "location_visa", label: "Location/visa" },
  { code: "position_filled", label: "Position filled" },
  { code: "withdrew_interest", label: "Withdrew interest" },
  { code: "other", label: "Other" },
] as const;

/**
 * Reason recorded for callers that reject without choosing one: the public
 * REST API (`POST /api/v1/applications/{id}/reject`), the Harly AI
 * `rejectCandidate` tool and any legacy server-action caller. Keeps those
 * contracts working unchanged; every in-app reject goes through RejectDialog,
 * which requires an explicit reason.
 */
export const LEGACY_REJECTION_REASON_CODE = "other";

/** Template select value for Harly's built-in rejection email. */
export const BUILT_IN_REJECTION_TEMPLATE = "__built_in__";

export type RejectionReasonOption = {
  code: string;
  label: string;
  archived: boolean;
};

export type RejectionTemplateOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export type RejectionEmailPreview = {
  to: string;
  candidateName: string;
  subject: string;
  body: string;
};

const DEFAULT_LABELS = new Map<string, string>(
  DEFAULT_REJECTION_REASONS.map((reason) => [reason.code, reason.label]),
);

/** Display label for a stored code: catalog label, else default, else the code. */
export function rejectionReasonLabel(
  code: string | null | undefined,
  catalog?: ReadonlyMap<string, string>,
): string | null {
  if (!code) return null;
  return catalog?.get(code) ?? DEFAULT_LABELS.get(code) ?? code;
}

/** Stable code for a new custom reason label ("Culture add" → "culture_add"). */
export function rejectionReasonCodeFromLabel(label: string): string {
  const slug = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug || "reason";
}

export const rejectionReasonLabelSchema = z
  .string()
  .trim()
  .min(1, "Name the reason.")
  .max(80, "Keep it under 80 characters.");

/** What the recruiter decides in RejectDialog. */
export const rejectionDecisionSchema = z
  .object({
    reasonCode: z.string().trim().min(1, "Choose a rejection reason.").max(64),
    note: z
      .string()
      .trim()
      .max(2000, "Keep the note under 2,000 characters.")
      .optional()
      .transform((value) => (value ? value : undefined)),
    sendEmail: z.boolean(),
    /**
     * Email template to send. A template id, `null` for Harly's built-in
     * rejection email, or omitted for the workspace's active rejection
     * template (falling back to the built-in one).
     */
    templateId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type RejectionDecision = z.infer<typeof rejectionDecisionSchema>;

export const rejectApplicationsSchema = rejectionDecisionSchema
  .extend({
    applicationIds: z.array(z.string().min(1)).min(1).max(100),
  })
  .strict()
  .refine((value) => new Set(value.applicationIds).size === value.applicationIds.length, {
    message: "Duplicate applications.",
    path: ["applicationIds"],
  });

export type RejectApplicationsInput = z.input<typeof rejectApplicationsSchema>;

export type RejectTarget = {
  applicationId: string;
  candidateName: string;
  jobTitle?: string | null;
};

/**
 * Title, job line and button copy for one or many targets. Pure for tests.
 * `t` is a translator for `labels.rejectionReasons.dialogCopy`.
 */
export function rejectDialogCopy(
  t: ReturnType<typeof useTranslations>,
  targets: RejectTarget[],
) {
  const count = targets.length;
  const single = count === 1 ? targets[0] : null;
  const jobs = [
    ...new Set(
      targets
        .map((target) => target.jobTitle?.trim())
        .filter((title): title is string => Boolean(title)),
    ),
  ];
  const jobLine =
    jobs.length === 0
      ? null
      : jobs.length === 1
        ? single
          ? t("appliesTo", { job: jobs[0] })
          : t("allFor", { job: jobs[0] })
        : t("acrossJobs", { count: jobs.length });
  return {
    title: single ? t("rejectOne", { name: single.candidateName }) : t("rejectMany", { count }),
    jobLine,
    confirmLabel: single ? t("confirmOne") : t("confirmMany", { count }),
    successMessage: single
      ? t("successOne", { name: single.candidateName })
      : t("successMany", { count }),
  };
}
