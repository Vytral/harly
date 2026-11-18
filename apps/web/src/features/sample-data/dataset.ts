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

/** Rich-text (HTML) description, the same format the job editor stores. */
const SAMPLE_JOB_DESCRIPTION = [
  "<p>Our product engineering team builds accessible, reliable tools that hiring teams use every day. As a Senior Product Engineer you will work across the stack with design and product partners, take features from idea to production, and help shape our technical direction.</p>",
  "<h3>What you will do</h3>",
  "<ul><li>Lead the delivery of product features end to end, from discovery to release and iteration</li><li>Build accessible interfaces in React and TypeScript, backed by well-tested APIs</li><li>Review code and designs, and mentor engineers on the team</li><li>Improve reliability and performance with good observability and testing</li></ul>",
  "<h3>What we are looking for</h3>",
  "<ul><li>6+ years of professional software engineering experience</li><li>Strong TypeScript skills on both frontend and backend</li><li>Experience with relational databases such as PostgreSQL</li><li>A habit of clear, written communication with product and design</li></ul>",
  "<h3>Nice to have</h3>",
  "<ul><li>Accessibility expertise (WCAG 2.2)</li><li>Experience with system design for multi-tenant products</li></ul>",
  "<h3>What we offer</h3>",
  "<ul><li>Competitive salary and equity</li><li>Private health cover and 25 days of paid holiday</li><li>A yearly learning budget and a home-office stipend</li></ul>",
  "<h3>Location and work model</h3>",
  "<p>Fully remote within Europe, with team meetups twice a year.</p>",
  "<h3>Our hiring process</h3>",
  "<ol><li>Recruiter call (30 minutes)</li><li>Hiring manager conversation (45 minutes)</li><li>Technical interview: a pairing session, no take-home (90 minutes)</li><li>System design and team interview (60 minutes)</li><li>References and offer</li></ol>",
].join("");

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
      description: SAMPLE_JOB_DESCRIPTION,
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
