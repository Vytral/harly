import type { StageKind } from "@harly/db/stage-kind";

import { SAMPLE_EMAIL_DOMAIN, SAMPLE_JOB_TITLE, SAMPLE_SOURCE } from "./constants";

/**
 * The synthetic records a sample batch writes, as plain data. Persistence lives
 * in service.ts; keeping the shape here makes the dataset testable without a
 * database. Names are invented, emails are non-deliverable, and days are
 * relative to the moment the batch is loaded.
 */

export type SampleJobPlan = {
  title: string;
  department: string;
  location: string;
  employmentType: "full_time";
  workplaceType: "remote";
  description: string;
};

export type SampleCandidatePlan = {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  headline: string;
  summary: string;
  skills: string[];
  /** Pipeline stage by kind, so the target stage never depends on its name. */
  stage: StageKind;
  appliedDaysAgo: number;
  source: string;
};

export type SampleNotePlan = {
  candidateKey: string;
  body: string;
};

export type SampleInterviewPlan = {
  candidateKey: string;
  title: string;
  type: "technical";
  mode: "video";
  /** Whole days from the batch load date, at 10:00 UTC. */
  daysFromNow: number;
};

export type SampleDataset = {
  job: SampleJobPlan;
  candidates: SampleCandidatePlan[];
  notes: SampleNotePlan[];
  interviews: SampleInterviewPlan[];
};

export const SAMPLE_CANDIDATE_TOTAL = 8;

export function buildSampleDataset(): SampleDataset {
  const candidates: SampleCandidatePlan[] = [
    candidate("amara-okafor", "Amara", "Okafor", "Frontend lead, 7 years", ["React", "TypeScript", "Design systems"], "applied", 2),
    candidate("liam-chen", "Liam", "Chen", "Full-stack engineer, 5 years", ["Node.js", "PostgreSQL", "React"], "applied", 5),
    candidate("priya-raman", "Priya", "Raman", "Product engineer, 6 years", ["TypeScript", "Analytics", "Testing"], "screening", 9),
    candidate("mateo-rossi", "Mateo", "Rossi", "Backend engineer, 8 years", ["Go", "Kubernetes", "Observability"], "screening", 12),
    candidate("hannah-muller", "Hannah", "Muller", "Senior engineer, 9 years", ["React", "Performance", "Accessibility"], "interview", 16),
    candidate("kofi-mensah", "Kofi", "Mensah", "Platform engineer, 6 years", ["Rust", "Distributed systems", "SQL"], "interview", 20),
    candidate("sofia-lindqvist", "Sofia", "Lindqvist", "Staff engineer, 11 years", ["Architecture", "TypeScript", "Mentoring"], "offer", 24),
    candidate("jun-park", "Jun", "Park", "Junior developer, 2 years", ["JavaScript", "CSS"], "rejected", 30),
  ];

  return {
    job: {
      title: SAMPLE_JOB_TITLE,
      department: "Engineering",
      location: "Remote, Europe",
      employmentType: "full_time",
      workplaceType: "remote",
      description:
        "Sample job created to explore Harly. It is not a real opening and is never shown on your careers page while it stays a draft. Remove the sample data from the dashboard banner when you are done.",
    },
    candidates,
    notes: [
      {
        candidateKey: "priya-raman",
        body: "Sample note: strong ownership of an analytics migration. Ask about on-call load.",
      },
      {
        candidateKey: "hannah-muller",
        body: "Sample note: asked for a system design round. Schedule with the design panel.",
      },
      {
        candidateKey: "sofia-lindqvist",
        body: "Sample note: offer range agreed with the hiring manager. Waiting on references.",
      },
    ],
    interviews: [
      {
        candidateKey: "hannah-muller",
        title: "Sample technical interview",
        type: "technical",
        mode: "video",
        daysFromNow: 2,
      },
    ],
  };
}

function candidate(
  key: string,
  firstName: string,
  lastName: string,
  headline: string,
  skills: string[],
  stage: StageKind,
  appliedDaysAgo: number,
): SampleCandidatePlan {
  const local = `${firstName}.${lastName}`.toLowerCase();
  return {
    key,
    firstName,
    lastName,
    email: `${local}@${SAMPLE_EMAIL_DOMAIN}`,
    headline,
    summary: `${headline}. Sample candidate for trying out Harly; no real person is behind this record.`,
    skills,
    stage,
    appliedDaysAgo,
    source: SAMPLE_SOURCE,
  };
}
