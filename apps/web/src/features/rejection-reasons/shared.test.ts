import { describe, expect, it } from "vitest";

import { makeT } from "@/test-support/translator";
import {
  DEFAULT_REJECTION_REASONS,
  LEGACY_REJECTION_REASON_CODE,
  rejectApplicationsSchema,
  rejectDialogCopy as rejectDialogCopyWith,
  rejectionDecisionSchema,
  rejectionReasonCodeFromLabel,
  rejectionReasonLabel,
  rejectionReasonLabelSchema,
} from "./shared";

const translator = makeT("labels.rejectionReasons.dialogCopy");

function rejectDialogCopy(targets: Parameters<typeof rejectDialogCopyWith>[1]) {
  return rejectDialogCopyWith(translator, targets);
}

const TEMPLATE_ID = "6f1c2b8e-4a5d-4c3b-9e2f-1a2b3c4d5e6f";

describe("default catalog", () => {
  it("ships the expected reasons with unique codes, including the legacy default", () => {
    expect(DEFAULT_REJECTION_REASONS.map((reason) => reason.label)).toEqual([
      "Not enough experience",
      "Skills mismatch",
      "Salary expectations",
      "Location/visa",
      "Position filled",
      "Withdrew interest",
      "Other",
    ]);
    const codes = DEFAULT_REJECTION_REASONS.map((reason) => reason.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain(LEGACY_REJECTION_REASON_CODE);
  });
});

describe("rejectionDecisionSchema", () => {
  it("requires a reason code and an explicit email choice", () => {
    expect(rejectionDecisionSchema.safeParse({ sendEmail: true }).success).toBe(false);
    expect(rejectionDecisionSchema.safeParse({ reasonCode: "", sendEmail: true }).success).toBe(false);
    expect(rejectionDecisionSchema.safeParse({ reasonCode: "other" }).success).toBe(false);
    expect(
      rejectionDecisionSchema.safeParse({ reasonCode: "other", sendEmail: false }).success,
    ).toBe(true);
  });

  it("trims the note and drops it when blank", () => {
    const parsed = rejectionDecisionSchema.parse({
      reasonCode: "skills_mismatch",
      note: "   ",
      sendEmail: false,
    });
    expect(parsed.note).toBeUndefined();
    expect(
      rejectionDecisionSchema.parse({ reasonCode: "x", note: "  ok  ", sendEmail: false }).note,
    ).toBe("ok");
  });

  it("caps the note length", () => {
    const result = rejectionDecisionSchema.safeParse({
      reasonCode: "other",
      note: "x".repeat(2001),
      sendEmail: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a template id, null (built-in) or nothing (active template)", () => {
    const base = { reasonCode: "other", sendEmail: true };
    expect(rejectionDecisionSchema.parse({ ...base, templateId: TEMPLATE_ID }).templateId).toBe(
      TEMPLATE_ID,
    );
    expect(rejectionDecisionSchema.parse({ ...base, templateId: null }).templateId).toBeNull();
    expect(rejectionDecisionSchema.parse(base)).not.toHaveProperty("templateId");
    expect(rejectionDecisionSchema.safeParse({ ...base, templateId: "nope" }).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(
      rejectionDecisionSchema.safeParse({ reasonCode: "other", sendEmail: true, extra: 1 }).success,
    ).toBe(false);
  });
});

describe("rejectApplicationsSchema", () => {
  const base = { reasonCode: "other", sendEmail: true };

  it("needs at least one application and at most 100", () => {
    expect(rejectApplicationsSchema.safeParse({ ...base, applicationIds: [] }).success).toBe(false);
    expect(
      rejectApplicationsSchema.safeParse({
        ...base,
        applicationIds: Array.from({ length: 101 }, (_, i) => `a-${i}`),
      }).success,
    ).toBe(false);
    expect(rejectApplicationsSchema.safeParse({ ...base, applicationIds: ["a"] }).success).toBe(true);
  });

  it("rejects duplicate applications", () => {
    expect(
      rejectApplicationsSchema.safeParse({ ...base, applicationIds: ["a", "a"] }).success,
    ).toBe(false);
  });

  it("requires the reason even for a single application", () => {
    expect(
      rejectApplicationsSchema.safeParse({ applicationIds: ["a"], sendEmail: true }).success,
    ).toBe(false);
  });
});

describe("labels and codes", () => {
  it("prefers the workspace label, then the default, then the raw code", () => {
    const catalog = new Map([["skills_mismatch", "Skills gap"]]);
    expect(rejectionReasonLabel("skills_mismatch", catalog)).toBe("Skills gap");
    expect(rejectionReasonLabel("position_filled", catalog)).toBe("Position filled");
    expect(rejectionReasonLabel("custom_code", catalog)).toBe("custom_code");
    expect(rejectionReasonLabel(null)).toBeNull();
  });

  it("derives stable codes from labels", () => {
    expect(rejectionReasonCodeFromLabel("Culture add")).toBe("culture_add");
    expect(rejectionReasonCodeFromLabel("  Visa / relocación ")).toBe("visa_relocacion");
    expect(rejectionReasonCodeFromLabel("!!!")).toBe("reason");
  });

  it("validates reason names", () => {
    expect(rejectionReasonLabelSchema.safeParse("  ").success).toBe(false);
    expect(rejectionReasonLabelSchema.safeParse("x".repeat(81)).success).toBe(false);
    expect(rejectionReasonLabelSchema.parse("  Culture add ")).toBe("Culture add");
  });
});

describe("rejectDialogCopy", () => {
  it("names one candidate and their job", () => {
    expect(
      rejectDialogCopy([{ applicationId: "a", candidateName: "Ava Lee", jobTitle: "Designer" }]),
    ).toEqual({
      title: "Reject Ava Lee?",
      jobLine: "Applies to Designer.",
      confirmLabel: "Reject candidate",
      successMessage: "Ava Lee rejected.",
    });
  });

  it("counts many candidates and summarises their jobs", () => {
    const copy = rejectDialogCopy([
      { applicationId: "a", candidateName: "A", jobTitle: "Designer" },
      { applicationId: "b", candidateName: "B", jobTitle: "Engineer" },
      { applicationId: "c", candidateName: "C", jobTitle: "Engineer" },
    ]);
    expect(copy.title).toBe("Reject 3 candidates?");
    expect(copy.confirmLabel).toBe("Reject 3 candidates");
    expect(copy.jobLine).toBe("Across 2 jobs.");
    expect(
      rejectDialogCopy([
        { applicationId: "a", candidateName: "A", jobTitle: "Designer" },
        { applicationId: "b", candidateName: "B", jobTitle: "Designer" },
      ]).jobLine,
    ).toBe("All for Designer.");
  });
});
