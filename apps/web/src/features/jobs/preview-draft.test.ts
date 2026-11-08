import { describe, expect, it } from "vitest";

import { defaultJobApplicationConfig } from "./config";
import {
  readFormPreviewFields,
  sameFormPreviewFields,
  visibilityFromConfig,
  type FormPreviewFields,
} from "./preview-draft";

const base: FormPreviewFields = {
  department: "",
  location: "",
  employmentType: "full_time",
  experienceLevel: "",
  education: "",
  currency: "USD",
  salaryPeriod: "annual",
  officeAddress: "",
  jobLocationCountry: "",
  jobLocationRegion: "",
  remoteEligibleCountries: "",
  validThrough: "",
  slug: "",
  evaluationMode: "balanced",
  visibility: visibilityFromConfig(defaultJobApplicationConfig),
  questions: [],
};

describe("readFormPreviewFields", () => {
  it("reads live visibility, salary and questions off the form", () => {
    const fd = new FormData();
    fd.set("applicationPhoneVisibility", "required");
    fd.set("applicationGithubVisibility", "disabled");
    fd.set("salaryMin", "80000");
    fd.set("applicationQuestionsJson", JSON.stringify([{ label: "Why us?", type: "text", required: true }]));
    const next = readFormPreviewFields(fd, base);
    expect(next.visibility.phone).toBe("required");
    expect(next.visibility.github).toBe("disabled");
    expect(next.salaryMin).toBe(80000);
    expect(next.questions[0]?.label).toBe("Why us?");
  });

  it("keeps the fallback visibility for unchecked / missing radios", () => {
    const next = readFormPreviewFields(new FormData(), base);
    expect(next.visibility).toEqual(base.visibility);
  });

  it("detects identical reads", () => {
    const a = readFormPreviewFields(new FormData(), base);
    const b = readFormPreviewFields(new FormData(), base);
    expect(sameFormPreviewFields(a, b)).toBe(true);
  });
});
