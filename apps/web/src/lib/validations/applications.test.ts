import { describe, expect, it } from "vitest";

import {
  applicationFormSchema,
  createApplicationFormSchema,
  validateApplicationQuestionAnswers,
} from "./applications";

const questions = [
  {
    id: "work_authorization",
    label: "Work authorization",
    type: "select",
    required: true,
    options: ["Yes", "No"],
  },
  {
    id: "role_fit",
    label: "Why this role?",
    type: "textarea",
    required: false,
    minLength: 10,
  },
  {
    id: "notice_period",
    label: "Notice period",
    type: "text",
    required: false,
  },
] as const;

describe("applicationFormSchema", () => {
  const validInput = {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    resumeUrl: "/uploads/resumes/test/test.pdf",
    resumeKey: "resumes/test/test.pdf",
    resumeFileName: "resume.pdf",
    resumeFileType: "application/pdf" as const,
    resumeFileSize: 1024,
  };

  it("accepts valid input", () => {
    const result = applicationFormSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects missing first name", () => {
    const result = applicationFormSchema.safeParse({ ...validInput, firstName: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.firstName).toBeDefined();
    }
  });

  it("rejects missing last name", () => {
    const result = applicationFormSchema.safeParse({ ...validInput, lastName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = applicationFormSchema.safeParse({ ...validInput, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("lowercases email", () => {
    const result = applicationFormSchema.safeParse({ ...validInput, email: "Ada@Example.COM" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("ada@example.com");
    }
  });

  it("rejects missing resume url", () => {
    const result = applicationFormSchema.safeParse({ ...validInput, resumeUrl: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid resume file type", () => {
    const result = applicationFormSchema.safeParse({
      ...validInput,
      resumeFileType: "image/png",
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversized resume", () => {
    const result = applicationFormSchema.safeParse({
      ...validInput,
      resumeFileSize: 11 * 1024 * 1024,
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional phone", () => {
    const result = applicationFormSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeUndefined();
    }
  });

  it("accepts optional linkedin url", () => {
    const result = applicationFormSchema.safeParse({
      ...validInput,
      linkedinUrl: "https://linkedin.com/in/ada",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid linkedin url", () => {
    const result = applicationFormSchema.safeParse({
      ...validInput,
      linkedinUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("accepts question answers", () => {
    const result = applicationFormSchema.safeParse({
      ...validInput,
      questionAnswers: { work_authorization: "Yes" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts missing resume when resume is optional", () => {
    const optionalResumeSchema = createApplicationFormSchema({
      resumeRequired: false,
      profileLinks: {
        linkedin: { enabled: true, required: false },
        github: { enabled: true, required: false },
        website: { enabled: true, required: false },
      },
      sections: {
        personal: {
          phone: { visibility: "optional" },
          address: { visibility: "optional" },
          photo: { visibility: "disabled" },
          headline: { visibility: "optional" },
        },
        profile: {
          resume: { visibility: "optional" },
          education: { visibility: "optional" },
          experience: { visibility: "optional" },
          linkedinUrl: { visibility: "optional" },
          githubUrl: { visibility: "optional" },
          websiteUrl: { visibility: "optional" },
        },
        details: {
          coverLetter: { visibility: "optional" },
        },
      },
      questions: [],
    });
    const result = optionalResumeSchema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
    });

    expect(result.success).toBe(true);
  });

  it("requires configured address and cover letter fields", () => {
    const schema = createApplicationFormSchema({
      resumeRequired: false,
      profileLinks: {
        linkedin: { enabled: false, required: false },
        github: { enabled: false, required: false },
        website: { enabled: false, required: false },
      },
      sections: {
        personal: {
          phone: { visibility: "optional" },
          address: { visibility: "required" },
          photo: { visibility: "disabled" },
          headline: { visibility: "optional" },
        },
        profile: {
          resume: { visibility: "disabled" },
          education: { visibility: "optional" },
          experience: { visibility: "optional" },
          linkedinUrl: { visibility: "disabled" },
          githubUrl: { visibility: "disabled" },
          websiteUrl: { visibility: "disabled" },
        },
        details: {
          coverLetter: { visibility: "required" },
        },
      },
      questions: [],
    });

    const result = schema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      address: "",
      coverLetter: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.address).toBeDefined();
      expect(result.error.flatten().fieldErrors.coverLetter).toBeDefined();
    }
  });

  it("requires configured education and experience collections", () => {
    const schema = createApplicationFormSchema({
      resumeRequired: false,
      profileLinks: {
        linkedin: { enabled: false, required: false },
        github: { enabled: false, required: false },
        website: { enabled: false, required: false },
      },
      sections: {
        personal: {
          phone: { visibility: "optional" },
          address: { visibility: "optional" },
          photo: { visibility: "disabled" },
          headline: { visibility: "optional" },
        },
        profile: {
          resume: { visibility: "disabled" },
          education: { visibility: "required" },
          experience: { visibility: "required" },
          linkedinUrl: { visibility: "disabled" },
          githubUrl: { visibility: "disabled" },
          websiteUrl: { visibility: "disabled" },
        },
        details: {
          coverLetter: { visibility: "disabled" },
        },
      },
      questions: [],
    });

    const result = schema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      educationEntries: [],
      experienceEntries: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.educationEntries).toBeDefined();
      expect(result.error.flatten().fieldErrors.experienceEntries).toBeDefined();
    }
  });

  it("accepts structured education and experience entries", () => {
    const schema = createApplicationFormSchema({
      resumeRequired: false,
      profileLinks: {
        linkedin: { enabled: false, required: false },
        github: { enabled: false, required: false },
        website: { enabled: false, required: false },
      },
      sections: {
        personal: {
          phone: { visibility: "optional" },
          address: { visibility: "optional" },
          photo: { visibility: "disabled" },
          headline: { visibility: "optional" },
        },
        profile: {
          resume: { visibility: "disabled" },
          education: { visibility: "optional" },
          experience: { visibility: "optional" },
          linkedinUrl: { visibility: "disabled" },
          githubUrl: { visibility: "disabled" },
          websiteUrl: { visibility: "disabled" },
        },
        details: {
          coverLetter: { visibility: "disabled" },
        },
      },
      questions: [],
    });

    const result = schema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      educationEntries: [
        {
          id: "0b6c8966-a5c8-4266-bb7d-bae0c6e39900",
          school: "University of London",
          degree: "Bachelor's degree",
        },
      ],
      experienceEntries: [
        {
          id: "89c08002-8ec3-4bf3-bb5b-d482719ceef3",
          company: "Analytical Engines",
          title: "Programmer",
          current: false,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("ignores disabled fields if a client submits them anyway", () => {
    const schema = createApplicationFormSchema({
      resumeRequired: false,
      profileLinks: {
        linkedin: { enabled: false, required: false },
        github: { enabled: false, required: false },
        website: { enabled: false, required: false },
      },
      sections: {
        personal: {
          phone: { visibility: "disabled" },
          address: { visibility: "disabled" },
          photo: { visibility: "disabled" },
          headline: { visibility: "disabled" },
        },
        profile: {
          resume: { visibility: "disabled" },
          education: { visibility: "disabled" },
          experience: { visibility: "disabled" },
          linkedinUrl: { visibility: "disabled" },
          githubUrl: { visibility: "disabled" },
          websiteUrl: { visibility: "disabled" },
        },
        details: {
          coverLetter: { visibility: "disabled" },
        },
      },
      questions: [],
    });

    const result = schema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      linkedinUrl: "not-a-url",
      coverLetter: "hello",
      resumeUrl: "bad",
    });

    expect(result.success).toBe(true);
  });
});

describe("validateApplicationQuestionAnswers", () => {
  it("returns no errors when all answers are valid", () => {
    const errors = validateApplicationQuestionAnswers(
      {
        work_authorization: "Yes",
      },
      questions,
    );

    expect(errors).toEqual({});
  });

  it("returns error for unanswered required question", () => {
    const errors = validateApplicationQuestionAnswers(
      {
        work_authorization: "",
      },
      questions,
    );

    expect(errors.work_authorization).toBeDefined();
    expect(errors.work_authorization[0]).toBe("This question is required.");
  });

  it("returns error for short text answer", () => {
    const errors = validateApplicationQuestionAnswers(
      {
        work_authorization: "Yes",
        role_fit: "short",
      },
      questions,
    );

    expect(errors.role_fit).toBeDefined();
  });

  it("returns error for invalid select option", () => {
    const errors = validateApplicationQuestionAnswers(
      {
        work_authorization: "Maybe",
      },
      questions,
    );

    expect(errors.work_authorization).toBeDefined();
  });

  it("accepts empty optional question", () => {
    const errors = validateApplicationQuestionAnswers(
      {
        work_authorization: "Yes",
        notice_period: "",
      },
      questions,
    );

    expect(errors.notice_period).toBeUndefined();
  });

  it("returns no errors for empty answers when no required questions exist", () => {
    const errors = validateApplicationQuestionAnswers({}, questions);
    expect(errors.work_authorization).toBeDefined();
  });
});
