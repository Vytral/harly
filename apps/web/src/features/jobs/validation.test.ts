import { describe, expect, it } from "vitest";

import { jobFormSchema, jobStatusSchema } from "./validation";

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

  it("rejects short title", () => {
    const result = jobFormSchema.safeParse({
      title: "AB",
      employmentType: "full_time",
      workplaceType: "remote",
      description: "We are looking for a senior engineer to join our team.",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.title).toBeDefined();
    }
  });

  it("rejects short description", () => {
    const result = jobFormSchema.safeParse({
      title: "Senior Engineer",
      employmentType: "full_time",
      workplaceType: "remote",
      description: "Short",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.description).toBeDefined();
    }
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
