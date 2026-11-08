import { describe, expect, it } from "vitest";

import {
  getPublishBlockers,
  jobFormSchema,
  jobStatusSchema,
} from "./validation";

describe("jobFormSchema", () => {
  it("accepts valid input", () => {
    const result = jobFormSchema.safeParse({
      title: "Senior Engineer",
      employmentType: "full_time",
      workplaceType: "remote",
      description: "We are looking for a senior engineer to join our team.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = jobFormSchema.safeParse({ title: "   " });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.title).toBeDefined();
    }
  });

  it("creates a job with only a title (empty-instance minimum)", () => {
    // Mirrors what FormData yields for an untouched form: absent keys are null.
    const result = jobFormSchema.safeParse({
      title: "QA",
      slug: null,
      department: null,
      employmentType: null,
      workplaceType: null,
      education: null,
      evaluationMode: null,
      keywordsJson: null,
      description: null,
      contentSectionsJson: null,
      applicationQuestionsJson: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.employmentType).toBe("full_time");
      expect(result.data.workplaceType).toBe("remote");
      expect(result.data.evaluationMode).toBe("balanced");
      expect(result.data.description).toBe("");
      expect(result.data.keywords).toEqual([]);
      expect(result.data.contentSections).toEqual([]);
      expect(result.data.education).toBeUndefined();
    }
  });

  it("does not require a description to save", () => {
    const result = jobFormSchema.safeParse({
      title: "Senior Engineer",
      description: "Short",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid employment type", () => {
    const result = jobFormSchema.safeParse({
      title: "Senior Engineer",
      employmentType: "invalid",
      workplaceType: "remote",
      description: "We are looking for a senior engineer to join our team.",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid workplace type", () => {
    const result = jobFormSchema.safeParse({
      title: "Senior Engineer",
      employmentType: "full_time",
      workplaceType: "invalid",
      description: "We are looking for a senior engineer to join our team.",
    });

    expect(result.success).toBe(false);
  });

  it("accepts optional fields as undefined", () => {
    const result = jobFormSchema.safeParse({
      title: "Senior Engineer",
      employmentType: "full_time",
      workplaceType: "remote",
      description: "We are looking for a senior engineer to join our team.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.department).toBeUndefined();
      expect(result.data.salaryMin).toBeUndefined();
    }
  });

  it("accepts optional fields with values", () => {
    const result = jobFormSchema.safeParse({
      title: "Senior Engineer",
      slug: "senior-platform-engineer",
      employmentType: "full_time",
      workplaceType: "remote",
      description: "We are looking for a senior engineer to join our team.",
      department: "Engineering",
      salaryMin: 100000,
      salaryMax: 200000,
      currency: "USD",
      salaryPeriod: "annual",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.department).toBe("Engineering");
      expect(result.data.salaryMin).toBe(100000);
      expect(result.data.currency).toBe("USD");
      expect(result.data.slug).toBe("senior-platform-engineer");
    }
  });

  it("normalizes custom slug input", () => {
    const result = jobFormSchema.safeParse({
      title: "Senior Engineer",
      slug: "  Senior Platform Engineer!!  ",
      employmentType: "full_time",
      workplaceType: "remote",
      description: "We are looking for a senior engineer to join our team.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe("senior-platform-engineer");
    }
  });

  it("trims whitespace from string fields", () => {
    const result = jobFormSchema.safeParse({
      title: "  Senior Engineer  ",
      employmentType: "full_time",
      workplaceType: "remote",
      description: "  We are looking for a senior engineer.  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Senior Engineer");
    }
  });

  it("rejects salary min greater than max", () => {
    const result = jobFormSchema.safeParse({
      title: "Senior Engineer",
      employmentType: "full_time",
      workplaceType: "remote",
      description: "We are looking for a senior engineer to join our team.",
      salaryMin: 200000,
      salaryMax: 100000,
      currency: "USD",
      salaryPeriod: "annual",
    });

    expect(result.success).toBe(false);
  });

  it("requires currency and period when a salary amount is set", () => {
    const result = jobFormSchema.safeParse({
      title: "Senior Engineer",
      employmentType: "full_time",
      workplaceType: "remote",
      description: "We are looking for a senior engineer to join our team.",
      salaryMin: 100000,
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative salary", () => {
    const result = jobFormSchema.safeParse({
      title: "Senior Engineer",
      employmentType: "full_time",
      workplaceType: "remote",
      description: "We are looking for a senior engineer to join our team.",
      salaryMin: -100,
    });

    expect(result.success).toBe(false);
  });
});

describe("jobStatusSchema", () => {
  it("accepts draft", () => {
    expect(jobStatusSchema.parse("draft")).toBe("draft");
  });

  it("accepts open", () => {
    expect(jobStatusSchema.parse("open")).toBe("open");
  });

  it("accepts closed", () => {
    expect(jobStatusSchema.parse("closed")).toBe("closed");
  });

  it("rejects invalid status", () => {
    expect(jobStatusSchema.safeParse("archived").success).toBe(false);
  });
});

describe("getPublishBlockers", () => {
  it("blocks an empty or placeholder-only job", () => {
    expect(getPublishBlockers({ description: "" })).toHaveLength(1);
    expect(
      getPublishBlockers({
        description:
          "<p>Describe the role, the team, and the impact this person will have.</p>",
      }),
    ).toHaveLength(1);
  });

  it("passes with a description or a filled section", () => {
    expect(
      getPublishBlockers({
        description: "<p>We are hiring a senior engineer.</p>",
      }),
    ).toEqual([]);
    expect(
      getPublishBlockers({
        description: "",
        contentSections: [{ id: "a", title: "Requirements", body: "<p>TS</p>" }],
      }),
    ).toEqual([]);
  });

  it("blocks sections containing only nonbreaking spaces", () => {
    expect(getPublishBlockers({ contentSections: [{ title: "Requirements", body: "<p>&nbsp;&#160;&#xA0;</p>" }] })).toHaveLength(1);
  });
});
