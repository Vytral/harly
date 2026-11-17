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
        "Join our product engineering team to build accessible, reliable tools for hiring teams. You will work across the stack with design and product partners, mentor engineers, and help shape technical direction.",
    },
    candidates,
    notes: [
      {
        candidateKey: "priya-raman",
        body: "Strong ownership of an analytics migration. Ask about on-call load.",
      },
      {
        candidateKey: "hannah-muller",
        body: "Asked for a system design round. Schedule with the design panel.",
      },
      {
        candidateKey: "sofia-lindqvist",
        body: "Offer range agreed with the hiring manager. Waiting on references.",
      },
    ],
    interviews: [
      {
        candidateKey: "hannah-muller",
        title: "Technical interview",
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
  const summaries: Record<string, string> = {
    "amara-okafor": "Frontend lead with seven years building React and TypeScript products. Led a shared component library across three product teams, documented accessible interaction patterns, and mentored frontend engineers. Looking for a role combining hands-on delivery and technical leadership.",
    "liam-chen": "Full-stack engineer with five years delivering subscription products. Built Node.js APIs backed by PostgreSQL and React account-management flows. Owns features from schema design through testing, deployment, and production support.",
    "priya-raman": "Product engineer with six years turning product questions into reliable features. Led an analytics migration with TypeScript event contracts and automated regression tests, preserving historical reporting while replacing the ingestion pipeline. Interested in end-to-end ownership and a sustainable on-call rotation.",
    "mateo-rossi": "Backend engineer with eight years building Go services. Operated Kubernetes workloads, introduced service-level dashboards and tracing, and improved incident handovers. Strong in backend reliability; would need to deepen frontend experience for a product engineering role.",
    "hannah-muller": "Senior engineer with nine years improving React applications. Reduced slow page interactions through profiling and incremental rendering, and worked with designers to resolve keyboard-navigation and screen-reader issues. Wants a system design discussion alongside the technical interview.",
    "kofi-mensah": "Platform engineer with six years building distributed services in Rust and SQL. Delivered data-processing workers with retry and recovery controls, and documented operational procedures for the support team. Interested in applying systems experience closer to customer-facing product work.",
    "sofia-lindqvist": "Staff engineer with eleven years delivering product platforms. Led architecture reviews for TypeScript services, helped teams plan incremental migrations, and mentored engineers into technical leadership. Offer range is aligned with the hiring manager; references remain outstanding.",
    "jun-park": "Junior developer with two years building responsive JavaScript interfaces and CSS components. Delivered small features with code review and maintained browser compatibility checks. Promising early-career profile, but does not yet meet this senior role's architecture and mentoring requirements.",
  };
  const local = `${firstName}.${lastName}`.toLowerCase();
  return {
    key,
    firstName,
    lastName,
    email: `${local}@${SAMPLE_EMAIL_DOMAIN}`,
    headline,
    summary: summaries[key],
    skills,
    stage,
    appliedDaysAgo,
    source: SAMPLE_SOURCE,
  };
}
