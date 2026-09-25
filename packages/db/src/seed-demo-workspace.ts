import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";

import { createDatabaseClient, schema } from "./index";
import { buildResumeLines, linesToPdf } from "./fake-resumes";

type SeedClient = ReturnType<typeof createDatabaseClient>;

/**
 * Reusable demo seed. Populates a SPECIFIC workspace (by id) with realistic
 * jobs, candidates, applications across pipeline stages, a hiring team, notes,
 * scorecards, tags, interviews, activity and messages, plus Syntrix branding
 * and workspace settings with every real integration forced off. Idempotent:
 * wipes all workspace-scoped data first, then re-inserts — so this doubles as
 * the periodic demo reset.
 *
 * The workspace + its owner member must already exist (created via the /setup
 * bootstrap). Demo teammates are created here (no auth). Callers:
 *   - the CLI wrapper `scripts/seed-demo.ts` (resolves the workspace by email)
 *   - the `/api/cron/demo-reset` route (passes the demo workspace id directly)
 */

// Owner display name for the demo workspace.
const OWNER_NAME = "Alex Morgan";
// Fixed CDN host for demo assets (avatars, logos, hero). These live under
// /demo/* on the CDN so the periodic reset restores them identically every
// time. Override with DEMO_CDN_URL for local/preview environments.
const DEMO_CDN = (process.env.DEMO_CDN_URL ?? "https://cdn.harly.dev").replace(/\/$/, "");

/** Career board layout + copy captured from the live demo workspace.
 *  Gallery/team image URLs require matching files on DEMO_CDN under demo/careers/.
 */
const DEMO_CAREER_PAGE_CONFIG = {
  cta: {
    body: "We are always opening new opportunities for great people. Reach out.",
    color: "#d97656",
    title: "Don't see a role that fits?",
    enabled: true,
    buttonText: "Get in touch"
  },
  faq: {
    items: [],
    title: "Frequently asked questions",
    enabled: false
  },
  seo: {
    title: "",
    indexable: true,
    faviconUrl: null,
    description: "",
    socialImageUrl: null
  },
  hero: {
    overlay: "none",
    subhead: "",
    headline: "Syntrix",
    imageUrl: null,
    logoType: "logo",
    showName: false,
    overlayTo: null,
    overlayFrom: null,
    logoPosition: "center",
    showHeadline: false,
    bannerEnabled: true,
    ctaButtonText: "View jobs",
    bannerLogoDark: null,
    overlayOpacity: 40,
    bannerLogoLight: null,
    bannerLogoVariant: "dark"
  },
  intro: {
    body: "<p style=\"text-align: left;\">Syntrix is an Open-Source company dedicated to create and distribute Open Source Software to democrate access to all technologies possible.</p>",
    chips: [
      {
        icon: "users",
        label: "People"
      },
      {
        icon: "heart",
        label: "Personality"
      },
      {
        icon: "flame",
        label: "Passion"
      },
      {
        icon: "smile",
        label: "Positive"
      },
      {
        icon: "sparkles",
        label: "Craft"
      }
    ]
  },
  theme: {
    font: "sans",
    mode: "light",
    accent: "#d97555",
    rounded: "soft",
    background: "#ffffff"
  },
  footer: {
    socials: [
      {
        url: "https://linkedin.com/company/syntrixllc",
        platform: "linkedin"
      },
      {
        url: "https://instagram.com/syntrixco",
        platform: "instagram"
      },
      {
        url: "https://syntrix.com",
        platform: "website"
      }
    ],
    legalLinks: [ "privacy-policy", "terms-of-service", "cookie-policy", "candidate-notice" ]
  },
  values: {
    items: [
      {
        body: "We adapt our roadmap to what users actually need.",
        title: "Agile"
      },
      {
        body: "Our methods are transparent and co-constructed.",
        title: "Open"
      },
      {
        body: "We invest heavily in figuring things out.",
        title: "Inventive"
      },
      {
        body: "We are proactive and we listen.",
        title: "Present"
      }
    ],
    title: "Our values",
    enabled: true
  },
  gallery: {
    speed: "slow",
    images: [
      `${DEMO_CDN}/demo/careers/gallery/1.webp`,
      `${DEMO_CDN}/demo/careers/gallery/2.webp`,
      `${DEMO_CDN}/demo/careers/gallery/3.webp`,
      `${DEMO_CDN}/demo/careers/gallery/4.webp`
    ],
    enabled: true,
    autoplay: true
  },
  overview: {
    stats: [
      {
        icon: "calendar",
        label: "Founded",
        value: "2017"
      },
      {
        icon: "users",
        label: "Team",
        value: "941"
      },
      {
        icon: "map-pin",
        label: "Locations",
        value: "10"
      }
    ],
    title: "Overview",
    enabled: true
  },
  template: "playful",
  positions: {
    title: "Our open positions",
    filters: [ "department", "location", "type" ]
  },
  testimonials: {
    items: [
      {
        name: "Isabella Ashfield",
        role: "Product Manager - Lead",
        quote: "Syntrix is the best place that i ever worked, great team and also delisious food, really like it.",
        avatar: `${DEMO_CDN}/demo/careers/team/isabella.webp`
      }
    ],
    title: "What our team says",
    enabled: false
  }
};

// Where fictional resume PDFs get written. The web app's LocalAdapter serves
// `uploads/` relative to its own cwd (apps/web). The CLI runs from packages/db,
// so it passes an explicit path; callers inside the app can rely on the default.
function resolveUploadsRoot(explicit?: string): string {
  if (explicit) return explicit;
  return process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(process.cwd(), "uploads");
}

const DEFAULT_STAGES = [
  { name: "Applied", color: "#E0F2FE" },
  { name: "Screening", color: "#F5F3FF" },
  { name: "Interview", color: "#FEF3C7" },
  { name: "Offer", color: "#DCFCE7" },
  { name: "Hired", color: "#CCFBF1" },
  { name: "Rejected", color: "#FEE2E2" },
];

type StageName = (typeof DEFAULT_STAGES)[number]["name"];

// Demo teammates — real `user` + `member` rows (no auth) so the dashboard can
// show ownership, interviewers and a live team-activity feed.
const TEAMMATES = [
  { key: "sarah", id: "seed-teammate-sarah", name: "Sarah Chen", email: "sarah.chen@syntrix.com", avatar: "sarah" },
  { key: "james", id: "seed-teammate-james", name: "James Park", email: "james.park@syntrix.com", avatar: "james" },
  { key: "emma", id: "seed-teammate-emma", name: "Emma Wilson", email: "emma.wilson@syntrix.com", avatar: "emma" },
  { key: "diego", id: "seed-teammate-diego", name: "Diego Martinez", email: "diego.martinez@syntrix.com", avatar: "diego" },
  { key: "sofia", id: "seed-teammate-sofia", name: "Sofia Romero", email: "sofia.romero@syntrix.com", avatar: "sofia" },
];
const teammateId = (key: string) => TEAMMATES.find((t) => t.key === key)?.id;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

function todayAt(hour: number, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function daysFromNowAt(days: number, hour: number, minute = 0) {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function daysAgoAt(days: number, hour: number, minute = 0) {
  const d = daysAgo(days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const JOBS = [
  {
    title: "Senior Frontend Engineer",
    department: "Engineering",
    sector: "Software",
    location: "Remote (Americas)",
    employmentType: "full_time",
    workplaceType: "remote",
    experienceLevel: "Senior (5+ years)",
    education: "Bachelor's or equivalent experience",
    keywords: ["React", "TypeScript", "Next.js", "Tailwind", "GraphQL"],
    salaryMin: 120000,
    salaryMax: 160000,
    currency: "USD",
    salaryPeriod: "annual",
    status: "open",
    description:
      "<p>We're hiring a Senior Frontend Engineer to own our customer-facing dashboard end to end. You'll work closely with design and product to ship polished, fast interfaces.</p>",
  },
  {
    title: "Backend Engineer (Go)",
    department: "Engineering",
    sector: "Software",
    location: "Berlin, Germany",
    employmentType: "full_time",
    workplaceType: "hybrid",
    experienceLevel: "Mid (3+ years)",
    education: "Any",
    keywords: ["Go", "PostgreSQL", "Kubernetes", "gRPC", "AWS"],
    salaryMin: 70000,
    salaryMax: 95000,
    currency: "EUR",
    salaryPeriod: "annual",
    status: "open",
    description:
      "<p>Join our platform team building the APIs that power Syntrix. Strong Go and distributed-systems experience required.</p>",
  },
  {
    title: "Product Designer",
    department: "Design",
    sector: "Software",
    location: "Remote (Europe)",
    employmentType: "full_time",
    workplaceType: "remote",
    experienceLevel: "Mid (3+ years)",
    education: "Any",
    keywords: ["Figma", "Design systems", "Prototyping", "User research"],
    salaryMin: 80000,
    salaryMax: 115000,
    currency: "USD",
    salaryPeriod: "annual",
    status: "open",
    description:
      "<p>Shape the product experience across web and mobile. You'll own flows from research to high-fidelity design and partner with engineering on delivery.</p>",
  },
  {
    title: "Customer Support Specialist",
    department: "Support",
    sector: "Software",
    location: "Manila, Philippines",
    employmentType: "full_time",
    workplaceType: "onsite",
    experienceLevel: "Entry (1+ years)",
    education: "Any",
    keywords: ["Zendesk", "Communication", "Troubleshooting", "Hosting"],
    salaryMin: 18000,
    salaryMax: 26000,
    currency: "USD",
    salaryPeriod: "annual",
    status: "open",
    description:
      "<p>Be the first line of help for our hosting customers. Empathy, clear writing, and basic technical troubleshooting are key.</p>",
  },
  {
    title: "Growth Marketing Manager",
    department: "Marketing",
    sector: "Software",
    location: "New York, NY",
    employmentType: "full_time",
    workplaceType: "hybrid",
    experienceLevel: "Senior (5+ years)",
    education: "Bachelor's",
    keywords: ["SEO", "Paid acquisition", "Analytics", "Lifecycle", "Content"],
    salaryMin: 90000,
    salaryMax: 130000,
    currency: "USD",
    salaryPeriod: "annual",
    status: "open",
    description:
      "<p>Own the growth funnel from acquisition to activation. Data-driven, experiment-minded, and comfortable across paid and organic channels.</p>",
  },
  {
    title: "DevOps Engineer",
    department: "Engineering",
    sector: "Software",
    location: "Remote (Worldwide)",
    employmentType: "contract",
    workplaceType: "remote",
    experienceLevel: "Mid (3+ years)",
    education: "Any",
    keywords: ["Terraform", "AWS", "CI/CD", "Docker", "Observability"],
    salaryMin: 60,
    salaryMax: 95,
    currency: "USD",
    salaryPeriod: "monthly",
    status: "open",
    description:
      "<p>6-month contract to harden our infrastructure and CI/CD. Terraform and AWS expertise required; possibility to convert to full-time.</p>",
  },
  {
    title: "Sales Development Representative",
    department: "Sales",
    sector: "Software",
    location: "London, UK",
    employmentType: "full_time",
    workplaceType: "onsite",
    experienceLevel: "Entry (1+ years)",
    education: "Any",
    keywords: ["Outbound", "CRM", "Prospecting", "SaaS"],
    salaryMin: 35000,
    salaryMax: 50000,
    currency: "GBP",
    salaryPeriod: "annual",
    status: "draft",
    description:
      "<p>Generate and qualify pipeline for our account executives. Hungry, coachable, and resilient — prior SaaS outbound a plus.</p>",
  },
  {
    title: "Junior Software Engineer (PHP)",
    department: "Engineering",
    sector: "Software",
    location: "Remote (Europe)",
    employmentType: "full_time",
    workplaceType: "remote",
    experienceLevel: "Entry (1+ years)",
    education: "Any",
    keywords: ["PHP", "Laravel", "MySQL", "REST", "Git"],
    salaryMin: 40000,
    salaryMax: 60000,
    currency: "EUR",
    salaryPeriod: "annual",
    status: "open",
    description:
      "<p>Kick off your engineering career on our web platform team. You'll ship features in PHP/Laravel with mentorship from senior engineers.</p>",
  },
];

// Hiring manager (teammate key) per job index — drives the ownership labels.
const JOB_HM = ["sarah", "james", "emma", "sarah", "james", "diego", "emma", "james"];
// Extra interviewers assigned to each job's hiring team.
const JOB_INTERVIEWERS = [
  ["sofia", "diego"],
  ["diego"],
  ["sofia", "emma"],
  ["emma"],
  ["sofia"],
  ["diego"],
  ["emma"],
  ["diego", "sarah"],
];

const CANDIDATES = [
  { firstName: "Ava", lastName: "Thompson", email: "ava.thompson@gmail.com", location: "San Francisco, CA", headline: "Senior Frontend Engineer · ex-Vercel", github: "https://github.com/avathompson" },
  { firstName: "Liam", lastName: "Chen", email: "liam.chen@outlook.com", location: "Toronto, Canada", headline: "Full-stack engineer, React + Node", github: "https://github.com/liamchen" },
  { firstName: "Sofía", lastName: "Martínez", email: "sofia.martinez@gmail.com", location: "Madrid, Spain", headline: "Product Designer · design systems", website: "https://sofiamartinez.design" },
  { firstName: "Noah", lastName: "Williams", email: "noah.williams@outlook.com", location: "Austin, TX", headline: "Backend engineer, Go & Postgres", github: "https://github.com/noahw" },
  { firstName: "Emma", lastName: "Müller", email: "emma.mueller@gmail.com", location: "Berlin, Germany", headline: "Platform engineer, distributed systems", github: "https://github.com/emmamueller" },
  { firstName: "Kwame", lastName: "Mensah", email: "kwame.mensah@gmail.com", location: "Accra, Ghana", headline: "Growth marketer, B2B SaaS" },
  { firstName: "Priya", lastName: "Nair", email: "priya.nair@gmail.com", location: "Bangalore, India", headline: "Frontend engineer, TypeScript + React", github: "https://github.com/priyanair" },
  { firstName: "Lucas", lastName: "Oliveira", email: "lucas.oliveira@gmail.com", location: "São Paulo, Brazil", headline: "DevOps / SRE, AWS + Terraform", github: "https://github.com/lucasoliveira" },
  { firstName: "Mei", lastName: "Tanaka", email: "mei.tanaka@gmail.com", location: "Tokyo, Japan", headline: "Product designer, mobile-first", website: "https://meitanaka.com" },
  { firstName: "Daniel", lastName: "Kim", email: "daniel.kim@gmail.com", location: "Seoul, South Korea", headline: "Customer support lead, hosting" },
  { firstName: "Isabella", lastName: "Rossi", email: "isabella.rossi@gmail.com", location: "Milan, Italy", headline: "Lifecycle & content marketing" },
  { firstName: "Omar", lastName: "Haddad", email: "omar.haddad@gmail.com", location: "Dubai, UAE", headline: "Senior backend engineer, Go", github: "https://github.com/omarhaddad" },
  { firstName: "Charlotte", lastName: "Dubois", email: "charlotte.dubois@gmail.com", location: "Paris, France", headline: "Frontend engineer, design-minded", github: "https://github.com/cdubois" },
  { firstName: "Ethan", lastName: "Brown", email: "ethan.brown@gmail.com", location: "London, UK", headline: "SDR, SaaS outbound" },
  { firstName: "Aisha", lastName: "Khan", email: "aisha.khan@gmail.com", location: "Karachi, Pakistan", headline: "Support specialist, technical" },
  { firstName: "Mateo", lastName: "González", email: "mateo.gonzalez@gmail.com", location: "Buenos Aires, Argentina", headline: "DevOps engineer, Kubernetes", github: "https://github.com/mateog" },
  { firstName: "Hannah", lastName: "Schmidt", email: "hannah.schmidt@gmail.com", location: "Vienna, Austria", headline: "Growth marketing manager" },
  { firstName: "Yuki", lastName: "Sato", email: "yuki.sato@gmail.com", location: "Osaka, Japan", headline: "Frontend engineer, Next.js", github: "https://github.com/yukisato" },
  { firstName: "Olivia", lastName: "Nguyen", email: "olivia.nguyen@gmail.com", location: "Sydney, Australia", headline: "Product designer, B2B SaaS", website: "https://olivian.design" },
  { firstName: "Carlos", lastName: "Rivera", email: "carlos.rivera@gmail.com", location: "Mexico City, Mexico", headline: "Backend engineer, Go + gRPC", github: "https://github.com/carlosr" },
];

// candidate index → job index → stage → source. Index in this array = pipeline
// order; `STAGE_AGE[order]` = days the candidate has sat in its current stage,
// which drives the dashboard's aging/severity (a deliberate mix: fresh today,
// due in a couple of days, and a few genuinely overdue).
const APPLICATIONS: { c: number; j: number; stage: StageName; source: string }[] = [
  { c: 0, j: 0, stage: "Offer", source: "LinkedIn" },
  { c: 6, j: 0, stage: "Interview", source: "Referral" },
  { c: 12, j: 0, stage: "Screening", source: "Company website" },
  { c: 17, j: 0, stage: "Applied", source: "Indeed" },
  { c: 2, j: 0, stage: "Rejected", source: "LinkedIn" },
  { c: 3, j: 1, stage: "Hired", source: "Referral" },
  { c: 4, j: 1, stage: "Interview", source: "LinkedIn" },
  { c: 11, j: 1, stage: "Screening", source: "Company website" },
  { c: 19, j: 1, stage: "Applied", source: "Career fair" },
  { c: 2, j: 2, stage: "Offer", source: "Dribbble" },
  { c: 8, j: 2, stage: "Interview", source: "Referral" },
  { c: 18, j: 2, stage: "Screening", source: "LinkedIn" },
  { c: 12, j: 2, stage: "Applied", source: "Company website" },
  { c: 9, j: 3, stage: "Hired", source: "Indeed" },
  { c: 14, j: 3, stage: "Interview", source: "Company website" },
  { c: 19, j: 3, stage: "Applied", source: "LinkedIn" },
  { c: 5, j: 4, stage: "Interview", source: "LinkedIn" },
  { c: 10, j: 4, stage: "Screening", source: "Referral" },
  { c: 16, j: 4, stage: "Offer", source: "Company website" },
  { c: 7, j: 5, stage: "Interview", source: "LinkedIn" },
  { c: 15, j: 5, stage: "Screening", source: "Company website" },
  { c: 7, j: 1, stage: "Applied", source: "Referral" },
  { c: 13, j: 6, stage: "Applied", source: "LinkedIn" },
  { c: 1, j: 0, stage: "Screening", source: "Referral" },
];
const STAGE_AGE = [3, 1, 0, 1, 2, 3, 1, 2, 0, 4, 2, 1, 0, 1, 0, 2, 2, 3, 1, 2, 0, 1, 2, 1];
// Round-robin of who advanced each candidate (feeds team-activity ownership).
const MOVERS = ["sarah", "diego", "emma", "james", "sofia"];

const TAGS = [
  { c: 0, labels: ["Top candidate", "Strong portfolio"] },
  { c: 3, labels: ["Hired", "Referral"] },
  { c: 6, labels: ["Bilingual", "Fast mover"] },
  { c: 2, labels: ["Design systems"] },
  { c: 9, labels: ["Hired", "Culture add"] },
  { c: 16, labels: ["Senior", "Needs follow-up"] },
  { c: 4, labels: ["Distributed systems"] },
  { c: 8, labels: ["Mobile", "Strong portfolio"] },
];

const NOTES = [
  { c: 0, body: "Great first call — clearly senior. Walked through a complex perf optimization at her last role. Moving to onsite." },
  { c: 0, body: "Reference check came back glowing. Recommend extending an offer." },
  { c: 6, body: "Solid React fundamentals. Slightly junior on architecture, but coachable. Worth an onsite." },
  { c: 3, body: "Accepted offer! Start date confirmed for next month. Loop in IT for laptop." },
  { c: 4, body: "Strong distributed-systems answers. Some hesitation on on-call expectations — clarify in next round." },
  { c: 2, body: "Beautiful portfolio. Design systems work is exactly what we need. Scheduling portfolio review." },
  { c: 16, body: "Impressive growth numbers at last role, but comp expectations are above band. Need to align." },
  { c: 9, body: "Excellent support instincts and writing. Offer sent and accepted." },
];

// `author` = teammate key, `aged` = days ago the scorecard was submitted.
const SCORECARDS = [
  { c: 0, rating: "strong", comment: "Top of the pile. Deep React + perf expertise, great communication.", stageName: "Interview", author: "emma", aged: 1 },
  { c: 6, rating: "mixed", comment: "Good fundamentals, lighter on system design. Lean yes.", stageName: "Interview", author: "diego", aged: 0 },
  { c: 4, rating: "strong", comment: "Strong backend + infra. Would hire.", stageName: "Interview", author: "sarah", aged: 2 },
  { c: 2, rating: "strong", comment: "Exceptional design craft and process.", stageName: "Offer", author: "sofia", aged: 3 },
  { c: 16, rating: "mixed", comment: "Great results, comp gap is the risk.", stageName: "Offer", author: "james", aged: 1 },
  { c: 5, rating: "weak", comment: "Channel experience too narrow for this role.", stageName: "Interview", author: "emma", aged: 0 },
];

const MESSAGES = [
  { c: 0, subject: "Next steps — Senior Frontend Engineer", body: "Hi Ava, we loved your onsite. We'd like to move forward with an offer — call you tomorrow to discuss details." },
  { c: 3, subject: "Welcome to Syntrix!", body: "Hi Noah, thrilled to have you on board. Your start details and onboarding plan are attached." },
  { c: 16, subject: "Quick comp conversation", body: "Hi Hannah, great to connect. Could we chat briefly about compensation expectations before the next round?" },
];

const TASKS = [
  { title: "Review Ava Thompson's offer letter", status: "pending", priority: "high", owner: "sarah", dueDaysFromNow: 2 },
  { title: "Schedule portfolio review with Sofía Martínez", status: "pending", priority: "medium", owner: "emma", dueDaysFromNow: 3 },
  { title: "Send onboarding docs to Noah Williams", status: "completed", priority: "high", owner: "james", dueDaysFromNow: -1 },
  { title: "Prepare technical assessment for Backend Engineer role", status: "in_progress", priority: "medium", owner: "diego", dueDaysFromNow: 4 },
  { title: "Follow up with Isabella Rossi on marketing role", status: "pending", priority: "low", owner: "sofia", dueDaysFromNow: 5 },
  { title: "Update job description for DevOps contract", status: "pending", priority: "medium", owner: "diego", dueDaysFromNow: 6 },
];

// Interviews reference an application by `${c}-${j}`; `interviewer` = teammate key.
const INTERVIEWS: {
  c: number;
  j: number;
  type: "screening" | "culture_fit" | "technical" | "onsite" | "final";
  mode: "video" | "phone" | "onsite";
  when: Date;
  interviewer: string;
  status?: "scheduled" | "completed" | "canceled";
  title?: string;
}[] = [
  // Today — drives the "Today's interviews" widget.
  { c: 6, j: 0, type: "culture_fit", mode: "video", when: todayAt(11, 0), interviewer: "sofia", title: "Culture fit interview" },
  { c: 4, j: 1, type: "technical", mode: "video", when: todayAt(14, 30), interviewer: "diego", title: "Technical interview" },
  // Upcoming.
  { c: 8, j: 2, type: "onsite", mode: "onsite", when: daysFromNowAt(1, 10, 0), interviewer: "emma", title: "Portfolio review" },
  { c: 5, j: 4, type: "screening", mode: "phone", when: daysFromNowAt(2, 9, 30), interviewer: "sofia", title: "Recruiter screen" },
  // Recently completed — feed the Interviews KPI, velocity and team activity.
  { c: 0, j: 0, type: "final", mode: "onsite", when: daysAgoAt(2, 15), interviewer: "sarah", status: "completed", title: "Final round" },
  { c: 2, j: 2, type: "onsite", mode: "onsite", when: daysAgoAt(4, 13), interviewer: "emma", status: "completed", title: "Portfolio review" },
  { c: 14, j: 3, type: "technical", mode: "video", when: daysAgoAt(6, 11), interviewer: "diego", status: "completed", title: "Technical interview" },
  { c: 16, j: 4, type: "screening", mode: "phone", when: daysAgoAt(9, 16), interviewer: "sofia", status: "completed", title: "Recruiter screen" },
  { c: 6, j: 0, type: "technical", mode: "video", when: daysAgoAt(1, 10), interviewer: "diego", status: "completed", title: "Technical interview" },
];

export type SeedDemoResult = {
  workspaceId: string;
  wipedTables: number;
  jobs: number;
  candidates: number;
  applications: number;
  interviews: number;
};

export type SeedDemoOptions = {
  db: SeedClient["db"];
  sql: SeedClient["sql"];
  /** The workspace (organization id) to seed/reset. It must already exist. */
  workspaceId: string;
  /** Absolute path to the uploads root for resume PDFs (defaults to cwd/uploads). */
  uploadsRoot?: string;
  /**
   * User id that owns attribution (jobs createdBy, etc.). Prefer the shared
   * demo login user. When omitted, the member with role `owner` is used —
   * never "oldest membership" (teammates are seeded with older createdAt).
   */
  ownerUserId?: string;
};

/**
 * Seed (or reset) a demo workspace in place. Idempotent — every run wipes all
 * workspace-scoped data and re-inserts the canonical Syntrix dataset. Does NOT
 * open or close the DB connection; the caller owns its lifecycle.
 */

async function wipeWorkspaceScopedData(input: {
  sql: SeedClient["sql"];
  workspaceId: string;
  ownerUserId: string;
}): Promise<number> {
  const { sql, workspaceId, ownerUserId } = input;
  const scopedTables = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'workspace_id'
    ORDER BY table_name
  `;
  await sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = 'replica'`;
    for (const { table_name } of scopedTables) {
      await tx`DELETE FROM ${tx(table_name)} WHERE workspace_id = ${workspaceId}`;
    }
    await tx`DELETE FROM invitation WHERE organization_id = ${workspaceId}`;
    await tx`DELETE FROM member_sender_identity WHERE organization_id = ${workspaceId}`;
    await tx`DELETE FROM session WHERE user_id = ${ownerUserId}`;
    await tx`DELETE FROM session WHERE user_id LIKE 'seed-teammate-%'`;
  });
  return scopedTables.length;
}

export async function seedDemoWorkspace(options: SeedDemoOptions): Promise<SeedDemoResult> {
  const { db, sql, workspaceId } = options;
  const webUploadsRoot = resolveUploadsRoot(options.uploadsRoot);

  {
    const [org] = await db
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.id, workspaceId))
      .limit(1);
    if (!org) {
      throw new Error(`No organization found for workspace id ${workspaceId}.`);
    }

    // Resolve attribution user: explicit ownerUserId → member.role === "owner".
    // Never "oldest membership" — teammates are seeded with older createdAt.
    let attributionUserId = options.ownerUserId ?? null;
    if (!attributionUserId) {
      const members = await db
        .select({ userId: schema.member.userId, role: schema.member.role })
        .from(schema.member)
        .where(eq(schema.member.organizationId, workspaceId));
      attributionUserId = members.find((m) => m.role === "owner")?.userId ?? null;
    }
    if (!attributionUserId) {
      throw new Error(
        `Workspace ${workspaceId} has no owner member to attribute demo data to. Pass ownerUserId.`,
      );
    }
    const [user] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, attributionUserId))
      .limit(1);
    if (!user) {
      throw new Error(`Owner user ${attributionUserId} not found for workspace ${workspaceId}.`);
    }
    const ownerEmail = user.email;

    console.log(`Seeding demo workspace "${org.name}" (${org.slug}) [${workspaceId}]…`);

    // ── Organization identity: unify naming to "Syntrix" + CDN logos ──
    await db
      .update(schema.organization)
      .set({
        name: "Syntrix",
        logo: `${DEMO_CDN}/demo/company/logo.svg`,
        logoEmail: `${DEMO_CDN}/demo/company/email-logo.png`,
      })
      .where(eq(schema.organization.id, workspaceId));

    // ── Workspace settings: clean Syntrix branding, NO real integrations ──
    // Seeded here (the script never touched this table before) so a wipe+reseed
    // fully restores branding and guarantees no real account stays connected.
    // AI config (aiEnabled + encrypted key) is intentionally left off — it
    // depends on the OpenCode Zen provider work and encryptSecret, handled in a
    // later step. Every integration toggle is false: no outbound side effects.
    await db
      .insert(schema.workspaceSettings)
      .values({
        organizationId: workspaceId,
        tagline: null,
        description: null,
        websiteUrl: "https://syntrix.cl",
        primaryColor: "#e76a17",
        heroImageUrl: `${DEMO_CDN}/demo/company/hero.jpg`,
        sidebarLogoUrl: `${DEMO_CDN}/demo/company/logo.svg`,
        sidebarLogoDarkUrl: `${DEMO_CDN}/demo/company/logo-dark.svg`,
        boardStyle: "minimal",
        logoStyle: "bordered",
        sidebarLogoStyle: "full",
        careerPageConfig: DEMO_CAREER_PAGE_CONFIG,
        // Integrations: all disconnected in the demo.
        aiEnabled: false,
        emailEnabled: false,
        emailInboundEnabled: false,
        calEnabled: false,
        turnstileEnabled: false,
        // Legal identity — fully fictional, all @syntrix.com.
        legalEntityName: "Syntrix Inc.",
        legalEntityEmail: "legal@syntrix.com",
        legalEntityWebsite: "https://syntrix.com",
        dpoEmail: "privacy@syntrix.com",
      })
      .onConflictDoUpdate({
        target: schema.workspaceSettings.organizationId,
        set: {
          tagline: null,
          description: null,
          websiteUrl: "https://syntrix.cl",
          primaryColor: "#e76a17",
          heroImageUrl: `${DEMO_CDN}/demo/company/hero.jpg`,
          sidebarLogoUrl: `${DEMO_CDN}/demo/company/logo.svg`,
          sidebarLogoDarkUrl: `${DEMO_CDN}/demo/company/logo-dark.svg`,
          boardStyle: "minimal",
          logoStyle: "bordered",
          sidebarLogoStyle: "full",
          careerPageConfig: DEMO_CAREER_PAGE_CONFIG,
          // Re-assert every real integration OFF on reseed (clears anything a
          // visitor or prior manual test connected).
          aiEnabled: false,
          aiProvider: null,
          aiModelId: null,
          aiApiKeyCiphertext: null,
          aiApiKeyIv: null,
          aiApiKeyTag: null,
          emailEnabled: false,
          emailProvider: null,
          emailFrom: null,
          emailApiKeyCiphertext: null,
          emailApiKeyIv: null,
          emailApiKeyTag: null,
          emailInboundEnabled: false,
          calEnabled: false,
          calApiKeyCiphertext: null,
          calApiKeyIv: null,
          calApiKeyTag: null,
          gcalEnabled: false,
          gcalAccountEmail: null,
          gcalRefreshTokenCiphertext: null,
          gcalRefreshTokenIv: null,
          gcalRefreshTokenTag: null,
          outlookEnabled: false,
          outlookAccountEmail: null,
          zoomEnabled: false,
          zoomClientId: null,
          zoomClientSecretCiphertext: null,
          zoomClientSecretIv: null,
          zoomClientSecretTag: null,
          zoomAccountId: null,
          zoomAccountEmail: null,
          zoomTokenCiphertext: null,
          zoomTokenIv: null,
          zoomTokenTag: null,
          zoomRefreshTokenCiphertext: null,
          zoomRefreshTokenIv: null,
          zoomRefreshTokenTag: null,
          zoomEvents: [],
          slackEnabled: false,
          slackClientId: null,
          slackClientSecretCiphertext: null,
          slackClientSecretIv: null,
          slackClientSecretTag: null,
          slackTeamId: null,
          slackTeamName: null,
          slackAppId: null,
          slackBotUserId: null,
          slackEnterpriseId: null,
          slackScopes: [],
          slackInstallerUserId: null,
          slackInstalledAt: null,
          slackLastValidatedAt: null,
          slackRevokedAt: null,
          slackChannelId: null,
          slackChannelName: null,
          slackBotTokenCiphertext: null,
          slackBotTokenIv: null,
          slackBotTokenTag: null,
          slackEvents: [],
          telegramEnabled: false,
          turnstileEnabled: false,
          turnstileSecretCiphertext: null,
          turnstileSecretIv: null,
          turnstileSecretTag: null,
          captchaEnabled: false,
          captchaProvider: null,
          recaptchaSiteKey: null,
          recaptchaSecretCiphertext: null,
          recaptchaSecretIv: null,
          recaptchaSecretTag: null,
          hcaptchaSiteKey: null,
          hcaptchaSecretCiphertext: null,
          hcaptchaSecretIv: null,
          hcaptchaSecretTag: null,
          chatEnabled: false,
          chatProvider: null,
          chatWebhookCiphertext: null,
          chatWebhookIv: null,
          chatWebhookTag: null,
          chatEvents: [],
          jitsiEnabled: false,
          jitsiBaseUrl: null,
          docusealEnabled: false,
          docusealUrl: null,
          docusealApiTokenCiphertext: null,
          docusealApiTokenIv: null,
          docusealApiTokenTag: null,
          docusealWebhookSecret: null,
          legalEntityName: "Syntrix Inc.",
          legalEntityEmail: "legal@syntrix.com",
          legalEntityWebsite: "https://syntrix.com",
          dpoEmail: "privacy@syntrix.com",
        },
      });

    // Normalise the owner's display name + avatar for the demo identity.
    await db
      .update(schema.user)
      .set({ name: OWNER_NAME, image: `${DEMO_CDN}/demo/team/alex.jpg` })
      .where(eq(schema.user.id, user.id));

    // ── Demo teammates (user + workspace membership; no auth) ──
    for (const t of TEAMMATES) {
      await db
        .insert(schema.user)
        .values({
          id: t.id,
          name: t.name,
          email: t.email,
          emailVerified: true,
          image: `${DEMO_CDN}/demo/team/${t.avatar}.jpg`,
        })
        .onConflictDoUpdate({
          target: schema.user.id,
          set: { name: t.name, email: t.email, image: `${DEMO_CDN}/demo/team/${t.avatar}.jpg` },
        });
      await db
        .insert(schema.member)
        .values({
          id: `seed-member-${t.key}`,
          organizationId: workspaceId,
          userId: t.id,
          role: "member",
          // Keep newer than a typical setup owner so createdAt never wins attribution.
          createdAt: daysAgo(7),
        })
        .onConflictDoNothing();
    }

    // ── Wipe ALL workspace-scoped data for this workspace ──
    // Catalog-driven: every table carrying a `workspace_id` column is cleared,
    // so new tables are covered automatically and nothing survives a reseed —
    // visitor uploads, AI chats, audit logs, notifications, workflow runs,
    // signatures, offers, etc. FK triggers are disabled for the transaction so
    // delete order doesn't matter (children and parents go together).
    //
    // Note: identity/config tables key off `organization_id`, not
    // `workspace_id` (user, member, organization, workspace_settings), so they
    // are intentionally NOT touched here — the org, teammates and the freshly
    // seeded workspace_settings all survive.
    // Catalog wipe in one transaction. Product inserts below are not in the
    // same tx (drizzle + volume); on insert failure we re-wipe so the workspace
    // never sits half-seeded — cron can retry a clean empty slate.
    const wipedTables = await wipeWorkspaceScopedData({
      sql,
      workspaceId,
      ownerUserId: user.id,
    });
    console.log(`Wiped ${wipedTables} workspace-scoped tables + sessions/invites.`);

    // Purge on-disk uploads for this workspace (DB rows are gone; blobs must go too).
    const workspaceUploadDir = path.join(webUploadsRoot, "workspaces", workspaceId);
    await rm(workspaceUploadDir, { recursive: true, force: true });
    await mkdir(path.join(webUploadsRoot, "workspaces", workspaceId, "resumes"), {
      recursive: true,
    });

    // Reset demo owner public profile fields that Layer-2 now blocks mid-session,
    // and clear username history so a prior visitor's handle cannot linger.
    await db
      .update(schema.user)
      .set({
        name: OWNER_NAME,
        image: `${DEMO_CDN}/demo/team/alex.jpg`,
        username: null,
        jobTitle: null,
        phone: null,
        location: null,
        bio: null,
        linkedinUrl: null,
        githubUrl: null,
        websiteUrl: null,
      })
      .where(eq(schema.user.id, user.id));
    await db.delete(schema.usernameHistory).where(eq(schema.usernameHistory.userId, user.id));

    try {
    // ── Jobs + stages ──
    const jobStageMap = new Map<number, Map<StageName, string>>();
    const jobIds: string[] = [];

    for (let j = 0; j < JOBS.length; j++) {
      const job = JOBS[j];
      const [created] = await db
        .insert(schema.jobs)
        .values({
          workspaceId,
          title: job.title,
          slug: job.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          department: job.department,
          sector: job.sector,
          location: job.location,
          employmentType: job.employmentType as "full_time" | "part_time" | "contract" | "internship",
          workplaceType: job.workplaceType as "remote" | "hybrid" | "onsite",
          experienceLevel: job.experienceLevel,
          education: job.education,
          keywords: job.keywords,
          description: job.description,
          contentSections: [
            { id: "responsibilities", title: "What you'll do", body: "<ul><li>Own features end to end</li><li>Collaborate across design and product</li><li>Raise the quality bar</li></ul>" },
            { id: "requirements", title: "Requirements", body: `<ul>${job.keywords.map((k) => `<li>${k}</li>`).join("")}</ul>` },
            { id: "benefits", title: "Benefits", body: "<ul><li>Remote-friendly</li><li>Equity</li><li>Learning budget</li></ul>" },
          ],
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          currency: job.currency,
          salaryPeriod: job.salaryPeriod,
          applicationConfig: {
            resumeRequired: true,
            profileLinks: { linkedin: true, github: true, website: true },
            questions: [],
          },
          boardConfig: {},
          status: job.status as "draft" | "open" | "closed",
          publishedAt: job.status === "open" ? daysAgo(22 - (j === 4 ? 0 : j)) : null,
          createdById: user.id,
          createdAt: daysAgo(j === 4 ? 35 : 25 - j),
        })
        .returning({ id: schema.jobs.id });

      jobIds.push(created.id);

      const stageRows = await db
        .insert(schema.jobStages)
        .values(
          DEFAULT_STAGES.map((stage, index) => ({
            workspaceId,
            jobId: created.id,
            name: stage.name,
            color: stage.color,
            order: index + 1,
          })),
        )
        .returning({ id: schema.jobStages.id, name: schema.jobStages.name });

      const map = new Map<StageName, string>();
      for (const row of stageRows) map.set(row.name as StageName, row.id);
      jobStageMap.set(j, map);
    }

    // ── Candidates ──
    const candidateIds: string[] = [];
    for (let c = 0; c < CANDIDATES.length; c++) {
      const cand = CANDIDATES[c];
      // Deterministic slug (accent-stripped) → CDN avatar under /demo/candidates.
      const slug = `${cand.firstName}-${cand.lastName}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const [created] = await db
        .insert(schema.candidates)
        .values({
          workspaceId,
          firstName: cand.firstName,
          lastName: cand.lastName,
          email: cand.email,
          phone: `+1 555 0${100 + c}`,
          location: cand.location,
          linkedinUrl: `https://linkedin.com/in/${cand.firstName.toLowerCase()}-${cand.lastName.toLowerCase().replace(/[^a-z]/g, "")}`,
          githubUrl: cand.github ?? null,
          websiteUrl: cand.website ?? null,
          avatarUrl: `${DEMO_CDN}/demo/candidates/${slug}.jpg`,
          headline: cand.headline,
          createdAt: daysAgo(28 - c),
        })
        .returning({ id: schema.candidates.id });
      candidateIds.push(created.id);

      // Fictional resume PDF → web app's local uploads dir + candidate_files row.
      const { lines, fileName } = buildResumeLines(cand, c);
      const pdf = linesToPdf(lines);
      const key = `resumes/seed-${cand.firstName.toLowerCase()}-${c}.pdf`
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
      const absolute = path.join(webUploadsRoot, key);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, pdf);
      await db.insert(schema.candidateFiles).values({
        workspaceId,
        candidateId: created.id,
        fileName,
        fileUrl: `/uploads/${key}`,
        fileType: "application/pdf",
        fileSize: pdf.byteLength,
        uploadedById: user.id,
        createdAt: daysAgo(28 - c),
      });
    }

    // ── Applications + stage history + activity ──
    const appIds = new Map<string, string>(); // `${c}-${j}` → applicationId
    let order = 0;
    for (const app of APPLICATIONS) {
      const stageMap = jobStageMap.get(app.j)!;
      const stageId = stageMap.get(app.stage)!;
      const appliedStageId = stageMap.get("Applied")!;
      const status =
        app.stage === "Hired"
          ? "hired"
          : app.stage === "Rejected"
            ? "rejected"
            : "active";
      const stageAge = STAGE_AGE[order] ?? 3;
      // Applied a few days before landing in the current stage (or just now if
      // still in Applied).
      const appliedExtra = app.stage === "Applied" ? 0 : 2 + (order % 4);
      const appliedAt = daysAgo(stageAge + appliedExtra);
      const enteredCurrentAt = daysAgoAt(stageAge, 9 + (order % 8));
      const moverId = teammateId(MOVERS[order % MOVERS.length]) ?? user.id;

      const [created] = await db
        .insert(schema.applications)
        .values({
          workspaceId,
          candidateId: candidateIds[app.c],
          jobId: jobIds[app.j],
          currentStageId: stageId,
          pipelineOrder: order,
          source: app.source,
          status: status as "active" | "hired" | "rejected" | "withdrawn",
          appliedAt,
        })
        .returning({ id: schema.applications.id });
      appIds.set(`${app.c}-${app.j}`, created.id);
      order++;

      // Stage history: Applied (at apply time) → current (varied recency).
      await db.insert(schema.applicationStageHistory).values({
        workspaceId,
        applicationId: created.id,
        fromStageId: null,
        toStageId: appliedStageId,
        movedById: user.id,
        createdAt: appliedAt,
      });
      if (app.stage !== "Applied") {
        await db.insert(schema.applicationStageHistory).values({
          workspaceId,
          applicationId: created.id,
          fromStageId: appliedStageId,
          toStageId: stageId,
          movedById: moverId,
          createdAt: enteredCurrentAt,
        });
      }

      await db.insert(schema.activityEvents).values({
        workspaceId,
        actorId: user.id,
        entityType: "application",
        entityId: created.id,
        type: "application.created",
        metadata: { source: app.source, stage: app.stage },
        createdAt: appliedAt,
      });
    }

    // ── Tags ──
    for (const tag of TAGS) {
      for (const label of tag.labels) {
        await db
          .insert(schema.candidateTags)
          .values({
            workspaceId,
            candidateId: candidateIds[tag.c],
            label,
            createdById: user.id,
          })
          .onConflictDoNothing();
      }
    }

    // ── Notes (+ activity) ──
    for (const note of NOTES) {
      const [created] = await db
        .insert(schema.candidateNotes)
        .values({
          workspaceId,
          candidateId: candidateIds[note.c],
          authorId: user.id,
          body: note.body,
          createdAt: daysAgo(5),
        })
        .returning({ id: schema.candidateNotes.id });
      await db.insert(schema.activityEvents).values({
        workspaceId,
        actorId: user.id,
        entityType: "candidate",
        entityId: candidateIds[note.c],
        type: "note.added",
        metadata: { noteId: created.id },
        createdAt: daysAgo(5),
      });
    }

    // ── Scorecards (varied authors + recency → team activity) ──
    // Link each scorecard to the candidate's application + the matching stage.
    // The unique index (workspace_id, application_id, author_id, stage_id) is
    // NULLS NOT DISTINCT, so leaving app/stage null collides whenever one author
    // has two scorecards — populate both to keep every row distinct and real.
    for (const card of SCORECARDS) {
      const appEntry = APPLICATIONS.find((a) => a.c === card.c);
      const applicationId = appEntry ? appIds.get(`${appEntry.c}-${appEntry.j}`) ?? null : null;
      const stageId = appEntry
        ? jobStageMap.get(appEntry.j)?.get(card.stageName as StageName) ?? null
        : null;
      await db.insert(schema.scorecards).values({
        workspaceId,
        candidateId: candidateIds[card.c],
        applicationId,
        stageId,
        authorId: teammateId(card.author) ?? user.id,
        rating: card.rating as "strong" | "mixed" | "weak",
        comment: card.comment,
        stageName: card.stageName,
        criteria: [],
        createdAt: daysAgoAt(card.aged, 12),
      });
    }

    // ── Messages ──
    for (const message of MESSAGES) {
      const cand = CANDIDATES[message.c];
      const [thread] = await db.insert(schema.mailThreads).values({
        workspaceId,
        source: "provider",
        mailboxId: null,
        candidateId: candidateIds[message.c],
        subject: message.subject,
        normalizedSubject: message.subject.toLowerCase(),
        participantEmail: cand.email,
        lastMessageAt: daysAgo(3),
      }).returning({ id: schema.mailThreads.id });
      await db.insert(schema.mailMessages).values({
        workspaceId,
        threadId: thread.id,
        candidateId: candidateIds[message.c],
        direction: "outbound",
        fromEmail: ownerEmail,
        toEmails: [cand.email],
        subject: message.subject,
        textBody: message.body,
        messageId: `seed:${message.c}:${message.subject}`,
        receivedAt: daysAgo(3),
        createdAt: daysAgo(3),
      });
    }

    // ── Hiring team: owner = recruiter, a teammate hiring manager + interviewers ──
    for (let j = 0; j < jobIds.length; j++) {
      await db
        .insert(schema.jobHiringTeam)
        .values({ workspaceId, jobId: jobIds[j], userId: user.id, role: "recruiter" })
        .onConflictDoNothing();
      const hmId = teammateId(JOB_HM[j]);
      if (hmId) {
        await db
          .insert(schema.jobHiringTeam)
          .values({ workspaceId, jobId: jobIds[j], userId: hmId, role: "hiring_manager" })
          .onConflictDoNothing();
      }
      for (const key of JOB_INTERVIEWERS[j] ?? []) {
        const iId = teammateId(key);
        if (!iId || iId === hmId) continue;
        await db
          .insert(schema.jobHiringTeam)
          .values({ workspaceId, jobId: jobIds[j], userId: iId, role: "interviewer" })
          .onConflictDoNothing();
      }
    }

    // ── Interviews (today, upcoming, recently completed) ──
    let interviewCount = 0;
    for (const iv of INTERVIEWS) {
      const applicationId = appIds.get(`${iv.c}-${iv.j}`);
      if (!applicationId) continue;
      await db.insert(schema.interviews).values({
        workspaceId,
        applicationId,
        jobId: jobIds[iv.j],
        candidateId: candidateIds[iv.c],
        interviewerId: teammateId(iv.interviewer) ?? user.id,
        title: iv.title ?? null,
        type: iv.type,
        mode: iv.mode,
        status: iv.status ?? "scheduled",
        scheduledAt: iv.when,
        createdAt: iv.status === "completed" ? iv.when : daysAgo(1 + (iv.c % 3)),
      });
      interviewCount++;
    }

    // ── Tasks ──
    for (const task of TASKS) {
      const ownerId = teammateId(task.owner) ?? user.id;
      await db.insert(schema.tasks).values({
        workspaceId,
        title: task.title,
        status: task.status as "pending" | "in_progress" | "completed" | "canceled",
        priority: task.priority as "low" | "medium" | "high" | "urgent",
        ownerId,
        createdById: user.id,
        dueDate: daysFromNowAt(task.dueDaysFromNow, 9),
        completedAt: task.status === "completed" ? daysAgo(1) : null,
      });
    }

    console.log(
      `Done: ${JOBS.length} jobs, ${TEAMMATES.length} teammates, ${CANDIDATES.length} candidates, ${APPLICATIONS.length} applications, ${interviewCount} interviews, ${NOTES.length} notes, ${SCORECARDS.length} scorecards, ${TAGS.reduce((n, t) => n + t.labels.length, 0)} tags, ${MESSAGES.length} messages, ${TASKS.length} tasks.`,
    );

    return {
      workspaceId,
      wipedTables,
      jobs: JOBS.length,
      candidates: CANDIDATES.length,
      applications: APPLICATIONS.length,
      interviews: interviewCount,
    };
    } catch (error) {
      console.error("Demo seed insert failed after wipe; re-wiping to empty workspace.", error);
      try {
        await wipeWorkspaceScopedData({
          sql,
          workspaceId,
          ownerUserId: user.id,
        });
      } catch (wipeError) {
        console.error("Demo re-wipe after failed seed also failed.", wipeError);
      }
      throw error;
    }
  }
}
