import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { eq, sql as dsql } from "drizzle-orm";

import { createDatabaseClient, schema } from "../src";
import { buildResumeLines, linesToPdf } from "./fake-resumes";

/**
 * Demo data seed — populates the workspace owned by SEED_EMAIL with realistic
 * jobs, candidates, applications across pipeline stages, a hiring team, notes,
 * scorecards, tags, interviews, activity and messages. Idempotent: wipes that
 * workspace's domain data first, then re-inserts. Identity (the SEED_EMAIL user
 * + org) must already exist; demo teammates are created here (no login).
 *
 * Run: pnpm db:seed:demo   (or SEED_EMAIL=you@x.com pnpm db:seed:demo)
 */

const SEED_EMAIL = process.env.SEED_EMAIL ?? "maxi@acme.test";
// Where the web app serves local uploads from (its LocalAdapter resolves
// `uploads/` against the app's cwd, i.e. apps/web).
const webUploadsRoot = path.resolve(process.cwd(), "../../apps/web/uploads");
// The dev account name carried a typo ("Maximliano"); normalise it on seed.
const OWNER_NAME = "Maximiliano Moldenhauer";

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
  { key: "sarah", id: "seed-teammate-sarah", name: "Sarah Chen", email: "sarah.chen@ploxhost.test" },
  { key: "james", id: "seed-teammate-james", name: "James Park", email: "james.park@ploxhost.test" },
  { key: "emma", id: "seed-teammate-emma", name: "Emma Wilson", email: "emma.wilson@ploxhost.test" },
  { key: "diego", id: "seed-teammate-diego", name: "Diego Martinez", email: "diego.martinez@ploxhost.test" },
  { key: "sofia", id: "seed-teammate-sofia", name: "Sofia Romero", email: "sofia.romero@ploxhost.test" },
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
      "<p>Join our platform team building the APIs that power PloxHost. Strong Go and distributed-systems experience required.</p>",
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
];

// Hiring manager (teammate key) per job index — drives the ownership labels.
const JOB_HM = ["sarah", "james", "emma", "sarah", "james", "diego", "emma"];
// Extra interviewers assigned to each job's hiring team.
const JOB_INTERVIEWERS = [
  ["sofia", "diego"],
  ["diego"],
  ["sofia", "emma"],
  ["emma"],
  ["sofia"],
  ["diego"],
  ["emma"],
];

const CANDIDATES = [
  { firstName: "Ava", lastName: "Thompson", email: "ava.thompson@gmail.com", location: "San Francisco, CA", headline: "Senior Frontend Engineer · ex-Vercel", github: "https://github.com/avathompson" },
  { firstName: "Liam", lastName: "Chen", email: "liam.chen@outlook.com", location: "Toronto, Canada", headline: "Full-stack engineer, React + Node", github: "https://github.com/liamchen" },
  { firstName: "Sofía", lastName: "Martínez", email: "sofia.martinez@gmail.com", location: "Madrid, Spain", headline: "Product Designer · design systems", website: "https://sofiamartinez.design" },
  { firstName: "Noah", lastName: "Williams", email: "noah.williams@proton.me", location: "Austin, TX", headline: "Backend engineer, Go & Postgres", github: "https://github.com/noahw" },
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
const STAGE_AGE = [4, 1, 0, 1, 8, 3, 1, 5, 0, 6, 2, 1, 0, 4, 0, 2, 2, 7, 1, 5, 0, 1, 2, 6];
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
  { c: 3, subject: "Welcome to PloxHost!", body: "Hi Noah, thrilled to have you on board. Your start details and onboarding plan are attached." },
  { c: 16, subject: "Quick comp conversation", body: "Hi Hannah, great to connect. Could we chat briefly about compensation expectations before the next round?" },
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

async function main() {
  const { db, sql } = createDatabaseClient();

  try {
    const [user] = await db
      .select()
      .from(schema.user)
      .where(eq(dsql`lower(${schema.user.email})`, SEED_EMAIL.toLowerCase()))
      .limit(1);

    if (!user) {
      throw new Error(
        `No user found for ${SEED_EMAIL}. Sign up + create a workspace first, then re-run.`,
      );
    }

    const [membership] = await db
      .select({ organizationId: schema.member.organizationId })
      .from(schema.member)
      .where(eq(schema.member.userId, user.id))
      .limit(1);

    if (!membership) {
      throw new Error(
        `${SEED_EMAIL} has no workspace. Create one at /onboarding first.`,
      );
    }

    const [org] = await db
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.id, membership.organizationId))
      .limit(1);

    const workspaceId = org.id;
    console.log(`Seeding workspace "${org.name}" (${org.slug}) for ${SEED_EMAIL}…`);

    // Normalise the owner's display name (fixes the "Maximliano" typo).
    if (user.name !== OWNER_NAME) {
      await db.update(schema.user).set({ name: OWNER_NAME }).where(eq(schema.user.id, user.id));
    }

    // ── Demo teammates (user + workspace membership; no auth) ──
    for (const t of TEAMMATES) {
      await db
        .insert(schema.user)
        .values({ id: t.id, name: t.name, email: t.email, emailVerified: true })
        .onConflictDoNothing();
      await db
        .insert(schema.member)
        .values({
          id: `seed-member-${t.key}`,
          organizationId: workspaceId,
          userId: t.id,
          role: "member",
          createdAt: daysAgo(60),
        })
        .onConflictDoNothing();
    }

    // ── Wipe existing domain data for this workspace (children → parents) ──
    const wipeOrder = [
      schema.interviews,
      schema.activityEvents,
      schema.candidateMessages,
      schema.scorecards,
      schema.candidateTags,
      schema.applicationAnswers,
      schema.applicationStageHistory,
      schema.candidateNotes,
      schema.candidateFiles,
      schema.applications,
      schema.jobHiringTeam,
      schema.applicationQuestions,
      schema.jobStages,
      schema.candidates,
      schema.jobs,
    ];
    for (const table of wipeOrder) {
      await db.delete(table).where(eq(table.workspaceId, workspaceId));
    }

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
          publishedAt: job.status === "open" ? daysAgo(30 - j) : null,
          createdById: user.id,
          createdAt: daysAgo(35 - j),
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
    for (const card of SCORECARDS) {
      await db.insert(schema.scorecards).values({
        workspaceId,
        candidateId: candidateIds[card.c],
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
      await db.insert(schema.candidateMessages).values({
        workspaceId,
        candidateId: candidateIds[message.c],
        authorId: user.id,
        direction: "outbound",
        toEmail: cand.email,
        fromEmail: SEED_EMAIL,
        subject: message.subject,
        body: message.body,
        status: "sent",
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

    console.log(
      `Done: ${JOBS.length} jobs, ${TEAMMATES.length} teammates, ${CANDIDATES.length} candidates, ${APPLICATIONS.length} applications, ${interviewCount} interviews, ${NOTES.length} notes, ${SCORECARDS.length} scorecards, ${TAGS.reduce((n, t) => n + t.labels.length, 0)} tags, ${MESSAGES.length} messages.`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Demo seed failed.");
  console.error(error);
  process.exit(1);
});
