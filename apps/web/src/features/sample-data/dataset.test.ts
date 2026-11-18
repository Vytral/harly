import { describe, expect, it } from "vitest";

import {
  SAMPLE_EMAIL_DOMAIN,
  SAMPLE_JOB_TITLE,
  isSampleEmailAddress,
  isSampleJobTitle,
} from "./constants";
import { SAMPLE_CANDIDATE_TOTAL, buildSampleDataset } from "./dataset";

describe("sample dataset", () => {
  const dataset = buildSampleDataset();

  it("recognizes the unchanged job title and legacy sample titles for removal", () => {
    expect(dataset.job.title).toBe(SAMPLE_JOB_TITLE);
    expect(isSampleJobTitle(dataset.job.title)).toBe(true);
    expect(isSampleJobTitle("Sample · Senior Product Engineer")).toBe(true);
    expect(isSampleJobTitle("Senior Product Engineer, updated")).toBe(false);
  });

  it("creates the expected number of candidates", () => {
    expect(dataset.candidates).toHaveLength(SAMPLE_CANDIDATE_TOTAL);
  });

  it("uses only the reserved sample domain for every email", () => {
    for (const candidate of dataset.candidates) {
      expect(candidate.email.endsWith(`@${SAMPLE_EMAIL_DOMAIN}`)).toBe(true);
      expect(isSampleEmailAddress(candidate.email)).toBe(true);
    }
    expect(SAMPLE_EMAIL_DOMAIN).toBe("careers.example");
  });

  it("spreads candidates across the pipeline stages by kind", () => {
    const kinds = new Set(dataset.candidates.map((candidate) => candidate.stage));
    expect(kinds).toEqual(
      new Set(["applied", "screening", "interview", "offer", "rejected"]),
    );
  });

  it("keeps candidate keys unique so notes and interviews resolve", () => {
    const keys = dataset.candidates.map((candidate) => candidate.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const note of dataset.notes) {
      expect(keys).toContain(note.candidateKey);
    }
    for (const interview of dataset.interviews) {
      expect(keys).toContain(interview.candidateKey);
    }
  });

  it("schedules exactly one interview, in the future, for an interview-stage candidate", () => {
    expect(dataset.interviews).toHaveLength(1);
    const [interview] = dataset.interviews;
    expect(interview.daysFromNow).toBeGreaterThan(0);
    const candidate = dataset.candidates.find((c) => c.key === interview.candidateKey);
    expect(candidate?.stage).toBe("interview");
  });

  it("marks anything that is not an address on the sample domain as real", () => {
    expect(isSampleEmailAddress("ada@example.com")).toBe(false);
    expect(isSampleEmailAddress("ADA@SAMPLE.INVALID")).toBe(true);
    expect(isSampleEmailAddress("ADA@CAREERS.EXAMPLE")).toBe(true);
  });
});
