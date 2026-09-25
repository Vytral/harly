/**
 * ATS Evaluation Bench — curated fixture corpus (Audit doc §19.1).
 *
 * Deliberately varied documents across roles, seniority, languages, timeline
 * edge cases, and skill edge cases. Layout-heavy variants (two-column, OCR,
 * DOCX) are tagged but represented as their extracted-text equivalents until
 * Phase 4 introduces the parsing-provider abstraction.
 */

import type { BenchmarkFixture, BenchmarkJobInput } from "./types";

export const BENCHMARK_REFERENCE_DATE = "2026-09-19";

export const backendSenior: BenchmarkFixture = {
  id: "backend-senior-python",
  tags: ["role:backend", "seniority:senior", "lang:en", "timeline:current_role"],
  description: "Senior backend engineer, current role, clean single-column layout.",
  resumeText: `Ana Torres
Senior Backend Engineer
ana.torres@example.com

EXPERIENCE

Senior Backend Engineer — Fintech Co (2022-Present)
• Designed payment services in Python and PostgreSQL handling 2M tx/day.
• Deployed containers with Docker and Kubernetes on AWS.

Backend Developer — ShopLine (2019-2022)
• Built REST APIs in Python (Django) backed by MySQL.
• Introduced CI/CD pipelines with GitHub Actions.

SKILLS
• Python, PostgreSQL, Docker, Kubernetes, AWS
• Django, MySQL, CI/CD

EDUCATION
B.Sc. Computer Science — State University (2015-2019)
`,
  job: {
    title: "Senior Backend Engineer",
    description: "Own core payment services.",
    requirements: "5+ years experience required. Python and PostgreSQL required.",
    experienceLevel: "Senior (5+ years)",
    education: "Bachelor's",
    keywords: ["Python", "PostgreSQL", "Kubernetes"],
  },
  gold: {
    positions: [
      { title: "Senior Backend Engineer", company: "Fintech Co", startYear: 2022, isCurrent: true },
      { title: "Backend Developer", company: "ShopLine", startYear: 2019, endYear: 2022, isCurrent: false },
    ],
    education: [{ degreeName: "B.Sc. Computer Science", levelRank: 3 }],
    skills: [
      { conceptId: "skill:python", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:postgresql", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:kubernetes", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:docker", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:aws", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:django", evidenceKinds: ["demonstrated_role", "declared"] },
    ],
    timelineMonths: 84, // 2022→2026 (48) + 2019→2022 (36)
    criterionExpectations: [
      { label: "Python", type: "skill", expectedStatus: "met" },
      { label: "PostgreSQL", type: "skill", expectedStatus: "met" },
      { label: "Kubernetes", type: "skill", expectedStatus: "met" },
      { label: "Experience", type: "experience_duration", expectedStatus: "met" },
      { label: "Education", type: "education", expectedStatus: "met" },
    ],
  },
};

export const frontendMidSpanish: BenchmarkFixture = {
  id: "frontend-mid-es",
  tags: ["role:frontend", "seniority:mid", "lang:es", "timeline:month_year_dates"],
  description: "Mid frontend engineer, Spanish resume, month/year dates.",
  resumeText: `Carlos Ruiz
Desarrollador Frontend
carlos.ruiz@example.com

EXPERIENCIA

Desarrollador Frontend — Agencia Pixel (Marzo 2023 - Actualidad)
• Construí aplicaciones con React y TypeScript.
• Migré componentes legacy de JavaScript a TypeScript.

Desarrollador Web — Estudio Norte (Enero 2021 - Febrero 2023)
• Maquetación con HTML y CSS (Tailwind).

HABILIDADES
• React, TypeScript, JavaScript, HTML, CSS

EDUCACIÓN
Ingeniería en Sistemas — Universidad Central (2016-2020)
`,
  job: {
    title: "Frontend Engineer",
    description: "Build product UI.",
    requirements: "React and TypeScript required.",
    experienceLevel: "Mid",
    education: null,
    keywords: ["React", "TypeScript", "GraphQL"],
  },
  gold: {
    positions: [
      { title: "Desarrollador Frontend", company: "Agencia Pixel", startYear: 2023, isCurrent: true },
      { title: "Desarrollador Web", company: "Estudio Norte", startYear: 2021, endYear: 2023, isCurrent: false },
    ],
    education: [{ degreeName: "Ingeniería en Sistemas", levelRank: 3 }],
    skills: [
      { conceptId: "skill:react", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:typescript", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:javascript", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:html", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:css", evidenceKinds: ["demonstrated_role", "declared"] },
    ],
    timelineMonths: 67, // 2023/3→2026/9 (42) + 2021/1→2023/2 (25)
    criterionExpectations: [
      { label: "React", type: "skill", expectedStatus: "met" },
      { label: "TypeScript", type: "skill", expectedStatus: "met" },
      { label: "GraphQL", type: "skill", expectedStatus: "not_demonstrated" },
    ],
  },
};

export const devopsOverlapping: BenchmarkFixture = {
  id: "devops-overlapping-roles",
  tags: ["role:devops", "seniority:senior", "lang:en", "timeline:overlapping_roles"],
  description: "Platform engineer with overlapping concurrent roles; union must not double count.",
  resumeText: `Priya Nair
Platform Engineer
priya.nair@example.com

EXPERIENCE

Platform Engineer — CloudWorks (2021-Present)
• Operated Kubernetes clusters and Terraform modules on AWS.

Contract SRE — SideStack (2022-2024)
• Hardened CI/CD and Linux infrastructure (concurrent engagement).

SKILLS
• Kubernetes, Terraform, AWS, Linux, CI/CD

EDUCATION
B.Eng. Computer Engineering — Tech Institute (2013-2017)
`,
  job: {
    title: "Platform Engineer",
    description: "Run the platform.",
    requirements: "4+ years Kubernetes required.",
    experienceLevel: "Senior (4+ years)",
    education: "Bachelor's",
    keywords: ["Kubernetes", "Terraform"],
  },
  gold: {
    positions: [
      { title: "Platform Engineer", company: "CloudWorks", startYear: 2021, isCurrent: true },
      { title: "Contract SRE", company: "SideStack", startYear: 2022, endYear: 2024, isCurrent: false },
    ],
    education: [{ degreeName: "B.Eng. Computer Engineering", levelRank: 3 }],
    skills: [
      { conceptId: "skill:kubernetes", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:terraform", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:aws", evidenceKinds: ["demonstrated_role", "declared"] },
    ],
    timelineMonths: 60, // union of 2021→2026 and 2022→2024
    criterionExpectations: [
      // Role dates bound a possible window, but do not prove continuous skill
      // usage without an explicit duration claim.
      { label: "Kubernetes", type: "skill", expectedStatus: "partially_met", expectedRelevantMonths: 60 },
      { label: "Terraform", type: "skill", expectedStatus: "met" },
    ],
  },
};

export const marketingGrowth: BenchmarkFixture = {
  id: "growth-marketing-manager",
  tags: ["role:marketing", "seniority:senior", "lang:en", "golden:isabella-like"],
  description: "Growth marketing manager; SEO/paid acquisition evidenced in work and skills.",
  resumeText: `Isabella Rossi
Lifecycle & content marketing
Milan, Italy · isabella.rossi@gmail.com

EXPERIENCE

Growth Marketing Manager — Nimbus Labs (2023–Present)
• Grew self-serve pipeline 3.2x in 18 months through SEO, lifecycle email and referral loops.
• Cut blended CAC 28% by reallocating paid spend based on cohort LTV analysis.

Marketing Manager — Mosaic HQ (2020–2023)
• Built the marketing analytics stack from scratch (GA4, Amplitude, dbt).

Content Marketer — Atlas Forge (2018–2020)
• Managed social and community programs reaching 80k followers.

SKILLS
• Lifecycle marketing: email, in-product, push (Customer.io, Braze)
• Paid acquisition: Google Ads, LinkedIn, Meta — $1M+ annual budget
• SEO and content strategy; analytics with GA4, Amplitude

EDUCATION
B.A. Business & Marketing — State University of Technology (2014–2018)
`,
  job: {
    title: "Growth Marketing Manager",
    description: "Own the growth funnel.",
    requirements: "Experience across paid and organic channels.",
    experienceLevel: "Senior (5+ years)",
    education: "Bachelor's",
    keywords: ["SEO", "Paid acquisition", "Analytics"],
  },
  gold: {
    positions: [
      { title: "Growth Marketing Manager", company: "Nimbus Labs", startYear: 2023, isCurrent: true },
      { title: "Marketing Manager", company: "Mosaic HQ", startYear: 2020, endYear: 2023, isCurrent: false },
      { title: "Content Marketer", company: "Atlas Forge", startYear: 2018, endYear: 2020, isCurrent: false },
    ],
    education: [{ degreeName: "B.A. Business & Marketing", levelRank: 3 }],
    skills: [
      { conceptId: "skill:seo", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:paid-acquisition", evidenceKinds: ["declared"] },
    ],
    timelineMonths: 96, // year-only rounding: 36 + 36 + 24
    criterionExpectations: [
      { label: "SEO", type: "skill", expectedStatus: "met" },
      { label: "Paid acquisition", type: "skill", expectedStatus: "met" },
      { label: "Experience", type: "experience_duration", expectedStatus: "met" },
      { label: "Education", type: "education", expectedStatus: "met" },
    ],
  },
};

export const keywordStuffer: BenchmarkFixture = {
  id: "adversarial-keyword-stuffing",
  tags: ["adversarial:keyword_stuffing", "role:backend", "lang:en"],
  description:
    "Adversarial: giant skill list with zero work evidence. Declared-only skills must not yield demonstrated tenure.",
  resumeText: `Sam Quick
Software Engineer
sam.quick@example.com

EXPERIENCE

Junior Developer — TinyShop (2025-Present)
• Maintained a WordPress site and fixed PHP bugs.

SKILLS
• Python, Java, Rust, Golang, Kubernetes, Docker, Terraform, AWS, GCP, Azure, React, Vue, Angular, Svelte, Node.js, Django, FastAPI, Spring Boot, GraphQL, Kafka, Redis, MongoDB, PostgreSQL, MySQL, Snowflake, Spark, TypeScript, JavaScript, C++, C#, .NET, Ruby, PHP, SQL, Linux, CI/CD, Agile

EDUCATION
B.Sc. Software Engineering — City College (2021-2025)
`,
  job: {
    title: "Backend Engineer",
    description: "Build backend services.",
    requirements: "3+ years experience required. Python required.",
    experienceLevel: "Mid (3+ years)",
    education: "Bachelor's",
    keywords: ["Python", "Kubernetes", "Rust"],
  },
  gold: {
    positions: [
      { title: "Junior Developer", company: "TinyShop", startYear: 2025, isCurrent: true },
    ],
    education: [{ degreeName: "B.Sc. Software Engineering", levelRank: 3 }],
    skills: [
      { conceptId: "skill:python", evidenceKinds: ["declared"] },
      { conceptId: "skill:kubernetes", evidenceKinds: ["declared"] },
      { conceptId: "skill:rust", evidenceKinds: ["declared"] },
    ],
    timelineMonths: 12, // year-only: (2026-2025)*12
    criterionExpectations: [
      { label: "Python", type: "skill", expectedStatus: "met" },
      // Counter-evidence: 21 months documented < 36 required → not_met.
      { label: "Experience", type: "experience_duration", expectedStatus: "not_met" },
    ],
  },
};


export const negatedMention: BenchmarkFixture = {
  id: "adversarial-negated-skill",
  tags: ["adversarial:negation", "role:backend", "lang:en"],
  description:
    "Adversarial: skill appears only in a negated context. Must not count as positive role tenure.",
  resumeText: `Lee Park
QA Analyst
lee.park@example.com

EXPERIENCE

QA Analyst — MedSoft (2020-Present)
• Manual testing of healthcare portals; no Java development involved.
• Wrote test plans and tracked defects.

SKILLS
• Manual testing, JIRA, bug triage

EDUCATION
Associate Degree — Community College (2018-2020)
`,
  job: {
    title: "Backend Engineer (Java)",
    description: "Java services.",
    requirements: "Java required.",
    experienceLevel: null,
    education: null,
    keywords: ["Java"],
  },
  gold: {
    positions: [
      { title: "QA Analyst", company: "MedSoft", startYear: 2020, isCurrent: true },
    ],
    education: [{ degreeName: "Associate Degree", levelRank: 2 }],
    skills: [],
    timelineMonths: 72, // year-only: (2026-2020)*12
    criterionExpectations: [
      { label: "Java", type: "skill", expectedStatus: "not_demonstrated" },
    ],
  },
};

export const relatedNotEquivalent: BenchmarkFixture = {
  id: "adversarial-related-not-equivalent",
  tags: ["adversarial:false_equivalence", "role:frontend", "lang:en"],
  description:
    "Adversarial: only Next.js is evidenced. A React criterion must NOT be satisfied by a related concept (§8.4).",
  resumeText: `Maya Chen
Frontend Developer
maya.chen@example.com

EXPERIENCE

Frontend Developer — Staticly (2023-Present)
• Built marketing sites with Next.js and CSS.

SKILLS
• Next.js, CSS

EDUCATION
B.A. Design — Arts College (2019-2023)
`,
  job: {
    title: "React Developer",
    description: "Build React apps.",
    requirements: "React required.",
    experienceLevel: null,
    education: null,
    keywords: ["React"],
  },
  gold: {
    positions: [
      { title: "Frontend Developer", company: "Staticly", startYear: 2023, isCurrent: true },
    ],
    education: [{ degreeName: "B.A. Design", levelRank: 3 }],
    skills: [
      { conceptId: "skill:nextjs", evidenceKinds: ["demonstrated_role", "declared"] },
      { conceptId: "skill:css", evidenceKinds: ["demonstrated_role", "declared"] },
    ],
    timelineMonths: 36, // year-only: (2026-2023)*12
    criterionExpectations: [
      { label: "React", type: "skill", expectedStatus: "not_demonstrated" },
    ],
  },
};

export const missingDates: BenchmarkFixture = {
  id: "timeline-missing-dates",
  tags: ["timeline:omitted_dates", "role:operations", "lang:en"],
  description: "Role without dates: engine must degrade confidence, never fabricate exact tenure.",
  resumeText: `Robin Vega
Operations Coordinator
robin.vega@example.com

EXPERIENCE

Operations Coordinator — LogiCorp
• Coordinated warehouse scheduling and vendor follow-ups.

EDUCATION
High School Diploma — East High (2012-2016)
`,
  job: {
    title: "Operations Manager",
    description: "Run operations.",
    requirements: "2+ years experience required.",
    experienceLevel: "Mid (2+ years)",
    education: null,
    keywords: [],
  },
  gold: {
    positions: [
      { title: "Operations Coordinator", company: "LogiCorp", startYear: 0, isCurrent: false },
    ],
    education: [{ degreeName: "High School Diploma", levelRank: 1 }],
    skills: [],
    timelineMonths: 0,
    criterionExpectations: [
      // Fallback estimate path: a role exists (18-month heuristic window) so not
      // "unknown", but 18 < 24 required → honestly partially_met. Never Strong Yes silently.
      { label: "Experience", type: "experience_duration", expectedStatus: "partially_met" },
    ],
  },
};

type SimpleGoldFixture = {
  id: string;
  tags: string[];
  person: string;
  title: string;
  company: string;
  startYear: number;
  endYear?: number;
  skill: string;
  conceptId: string;
  bullet: string;
  languageNote?: string;
};

/**
 * Additional human-readable gold fixtures. These intentionally keep one
 * primary criterion each: the fixture is about parser/canonicalization
 * behavior, while the larger corpus supplies role, domain, seniority,
 * language, and timeline diversity without hiding failures behind generated
 * expectations.
 */
function makeSimpleGoldFixture(spec: SimpleGoldFixture): BenchmarkFixture {
  const isCurrent = spec.endYear === undefined;
  const endYear = spec.endYear ?? Number(BENCHMARK_REFERENCE_DATE.slice(0, 4));
  const timelineMonths = (endYear - spec.startYear) * 12;
  const dateRange = isCurrent
    ? `${spec.startYear}-Present`
    : `${spec.startYear}-${spec.endYear}`;

  return {
    id: spec.id,
    tags: spec.tags,
    description: `${spec.title} fixture with ${spec.skill} evidence${spec.languageNote ? ` (${spec.languageNote})` : ""}.`,
    resumeText: `${spec.person}
${spec.title}

EXPERIENCE

${spec.title} — ${spec.company} (${dateRange})
• ${spec.bullet}

SKILLS
• ${spec.skill}
`,
    job: {
      title: spec.title,
      description: `Work as a ${spec.title}.`,
      requirements: `${spec.skill} required.`,
      experienceLevel: null,
      education: null,
      keywords: [spec.skill],
    },
    gold: {
      positions: [
        {
          title: spec.title,
          company: spec.company,
          startYear: spec.startYear,
          ...(spec.endYear === undefined ? { isCurrent: true } : { endYear: spec.endYear, isCurrent: false }),
        },
      ],
      education: [],
      skills: [{ conceptId: spec.conceptId, evidenceKinds: ["demonstrated_role", "declared"] }],
      timelineMonths,
      criterionExpectations: [
        { label: spec.skill, type: "skill", expectedStatus: "met" },
      ],
    },
  };
}

export const additionalGoldFixtures: BenchmarkFixture[] = [
  makeSimpleGoldFixture({ id: "data-analyst-sql", tags: ["role:data", "seniority:mid", "lang:en"], person: "Morgan Lee", title: "Data Analyst", company: "Northwind", startYear: 2022, endYear: 2024, skill: "SQL", conceptId: "skill:sql", bullet: "Built SQL reports for finance and operations." }),
  makeSimpleGoldFixture({ id: "android-java", tags: ["role:mobile", "seniority:senior", "lang:en"], person: "Jordan Kim", title: "Android Engineer", company: "Pocket Labs", startYear: 2021, skill: "Java", conceptId: "skill:java", bullet: "Shipped Java Android features used by millions." }),
  makeSimpleGoldFixture({ id: "security-csharp", tags: ["role:security", "seniority:mid", "lang:en"], person: "Taylor Brooks", title: "Security Engineer", company: "ShieldWorks", startYear: 2023, skill: "C#", conceptId: "skill:csharp", bullet: "Audited C# services and remediated authentication findings." }),
  makeSimpleGoldFixture({ id: "cloud-gcp", tags: ["role:devops", "seniority:senior", "lang:en"], person: "Riley Singh", title: "Cloud Engineer", company: "Orbit Cloud", startYear: 2020, endYear: 2023, skill: "GCP", conceptId: "skill:gcp", bullet: "Migrated production workloads to GCP." }),
  makeSimpleGoldFixture({ id: "php-laravel", tags: ["role:backend", "seniority:mid", "lang:en"], person: "Casey Young", title: "PHP Developer", company: "Commerce Stack", startYear: 2019, endYear: 2021, skill: "PHP", conceptId: "skill:php", bullet: "Maintained PHP services and Laravel integrations." }),
  makeSimpleGoldFixture({ id: "ruby-rails", tags: ["role:backend", "seniority:senior", "lang:en"], person: "Alex Morgan", title: "Ruby Engineer", company: "Civic Apps", startYear: 2022, skill: "Ruby", conceptId: "skill:ruby", bullet: "Delivered Ruby on Rails APIs for public services." }),
  makeSimpleGoldFixture({ id: "data-spark", tags: ["role:data", "seniority:senior", "lang:en"], person: "Jamie Patel", title: "Data Engineer", company: "Lakehouse Co", startYear: 2018, endYear: 2020, skill: "Spark", conceptId: "skill:spark", bullet: "Processed event data with Apache Spark." }),
  makeSimpleGoldFixture({ id: "warehouse-snowflake", tags: ["role:data", "seniority:mid", "lang:en"], person: "Drew Wilson", title: "Analytics Engineer", company: "Metric House", startYear: 2021, skill: "Snowflake", conceptId: "skill:snowflake", bullet: "Modeled reporting datasets in Snowflake." }),
  makeSimpleGoldFixture({ id: "messaging-kafka", tags: ["role:data", "seniority:senior", "lang:en"], person: "Quinn Evans", title: "Streaming Engineer", company: "Signal Grid", startYear: 2022, skill: "Kafka", conceptId: "skill:kafka", bullet: "Operated Apache Kafka pipelines at scale." }),
  makeSimpleGoldFixture({ id: "frontend-vue", tags: ["role:frontend", "seniority:mid", "lang:en"], person: "Harper Chen", title: "Vue Developer", company: "Bright UI", startYear: 2024, skill: "Vue", conceptId: "skill:vue", bullet: "Built Vue.js product interfaces." }),
  makeSimpleGoldFixture({ id: "frontend-angular", tags: ["role:frontend", "seniority:senior", "lang:en"], person: "Avery Garcia", title: "Angular Engineer", company: "Enterprise Web", startYear: 2020, endYear: 2022, skill: "Angular", conceptId: "skill:angular", bullet: "Led Angular modernization work." }),
  makeSimpleGoldFixture({ id: "frontend-svelte", tags: ["role:frontend", "seniority:mid", "lang:en"], person: "Emery Scott", title: "UI Engineer", company: "North Star", startYear: 2023, skill: "Svelte", conceptId: "skill:svelte", bullet: "Implemented accessible Svelte components." }),
  makeSimpleGoldFixture({ id: "marketing-seo-es", tags: ["role:marketing", "seniority:mid", "lang:es"], person: "Lucía Flores", title: "Especialista SEO", company: "Mercado Sur", startYear: 2021, skill: "SEO", conceptId: "skill:seo", bullet: "Mejoré el tráfico orgánico con auditorías SEO.", languageNote: "Spanish" }),
  makeSimpleGoldFixture({ id: "marketing-paid-fr", tags: ["role:marketing", "seniority:senior", "lang:fr"], person: "Claire Martin", title: "Growth Manager", company: "Paris Market", startYear: 2019, endYear: 2021, skill: "Paid acquisition", conceptId: "skill:paid-acquisition", bullet: "Piloté l'acquisition payante et les campagnes sociales.", languageNote: "French" }),
  makeSimpleGoldFixture({ id: "product-agile", tags: ["role:product", "seniority:mid", "lang:en"], person: "Reese Adams", title: "Product Manager", company: "Launchpad", startYear: 2020, skill: "Agile", conceptId: "skill:agile", bullet: "Ran Agile discovery and delivery rituals." }),
  makeSimpleGoldFixture({ id: "product-management", tags: ["role:product", "seniority:senior", "lang:en"], person: "Parker Bell", title: "Product Lead", company: "Roadmap Labs", startYear: 2018, endYear: 2020, skill: "Product management", conceptId: "skill:product-management", bullet: "Owned product management for a B2B platform." }),
  makeSimpleGoldFixture({ id: "design-uiux", tags: ["role:design", "seniority:mid", "lang:en"], person: "Sage Rivera", title: "Product Designer", company: "Human Scale", startYear: 2022, skill: "Figma", conceptId: "skill:ui-ux", bullet: "Designed UI/UX flows in Figma with research-backed prototypes." }),
  makeSimpleGoldFixture({ id: "sales-crm", tags: ["role:sales", "seniority:mid", "lang:en"], person: "Cameron Price", title: "Account Executive", company: "Revenue Works", startYear: 2021, skill: "CRM", conceptId: "skill:crm", bullet: "Managed the enterprise pipeline in a CRM." }),
  makeSimpleGoldFixture({ id: "devops-terraform", tags: ["role:devops", "seniority:senior", "lang:en"], person: "Finley Ross", title: "Infrastructure Engineer", company: "Reliable Systems", startYear: 2019, endYear: 2022, skill: "Terraform", conceptId: "skill:terraform", bullet: "Provisioned repeatable infrastructure with Terraform." }),
  makeSimpleGoldFixture({ id: "devops-azure", tags: ["role:devops", "seniority:mid", "lang:en"], person: "Rowan Diaz", title: "Cloud Administrator", company: "Azure House", startYear: 2023, skill: "Azure", conceptId: "skill:azure", bullet: "Supported Azure networks and deployment workflows." }),
  makeSimpleGoldFixture({ id: "backend-go", tags: ["role:backend", "seniority:senior", "lang:en"], person: "Milan Novak", title: "Go Engineer", company: "Fast Path", startYear: 2018, endYear: 2021, skill: "Go", conceptId: "skill:golang", bullet: "Built concurrent Go services for logistics." }),
  makeSimpleGoldFixture({ id: "backend-rust", tags: ["role:backend", "seniority:mid", "lang:en"], person: "Noah Reed", title: "Systems Engineer", company: "Safe Compute", startYear: 2024, skill: "Rust", conceptId: "skill:rust", bullet: "Implemented memory-safe Rust services." }),
  makeSimpleGoldFixture({ id: "backend-node", tags: ["role:backend", "seniority:mid", "lang:en"], person: "Kai Turner", title: "Node.js Engineer", company: "API Works", startYear: 2021, skill: "Node.js", conceptId: "skill:nodejs", bullet: "Scaled Node.js APIs for customer traffic." }),
];

export const BENCHMARK_CORPUS: BenchmarkFixture[] = [
  backendSenior,
  frontendMidSpanish,
  devopsOverlapping,
  marketingGrowth,
  keywordStuffer,
  negatedMention,
  relatedNotEquivalent,
  missingDates,
  ...additionalGoldFixtures,
];

/**
 * Layout robustness fixtures (Audit doc §6, §19.1).
 *
 * These carry NO accuracy gold: a row-major dump of a two-column CV destroys
 * section contiguity, so the honest bar is graceful degradation — no phantom
 * facts, no crash, explicit review escalation — not match accuracy. Each
 * interleaved document pairs with an ordered control holding IDENTICAL
 * content, proving degradation is layout-caused rather than content-caused.
 */
export interface LayoutFixture {
  id: string;
  tags: string[];
  description: string;
  resumeText: string;
  job: BenchmarkJobInput;
}

const layoutJob: BenchmarkJobInput = {
  title: "Backend Engineer",
  description: "Build backend services.",
  requirements: null,
  experienceLevel: "Mid (3+ years)",
  education: null,
  keywords: ["Python"],
};

const layoutControlText = `Ana Torres
Senior Backend Engineer
ana.torres@example.com

EXPERIENCE
Backend Developer — Fintech Co (2022-Present)
• Designed payment services in Python and PostgreSQL.
• Deployed containers with Docker.

SKILLS
• Python, PostgreSQL, Docker

EDUCATION
B.Sc. Computer Science — State University (2015-2019)
`;

export const twoColumnInterleaved: LayoutFixture = {
  id: "layout-two-column-interleaved",
  tags: ["layout:two-column", "lang:en"],
  description:
    "Row-major dump of a two-column CV: headers merge into content lines and sections lose contiguity. Must degrade gracefully.",
  resumeText: `Ana Torres Senior Backend Engineer
ana.torres@example.com EXPERIENCE
Backend Developer — Fintech Co (2022-Present) • Designed payment services in Python and PostgreSQL.
• Deployed containers with Docker. SKILLS
• Python, PostgreSQL, Docker EDUCATION
B.Sc. Computer Science — State University (2015-2019)
`,
  job: layoutJob,
};

export const twoColumnControl: LayoutFixture = {
  id: "layout-two-column-control",
  tags: ["layout:single-column-control", "lang:en"],
  description: "Identical content to the interleaved fixture in normal reading order. Must parse fully.",
  resumeText: layoutControlText,
  job: layoutJob,
};

export const scannedEmpty: LayoutFixture = {
  id: "layout-scanned-empty",
  tags: ["layout:scan-unreadable", "lang:en"],
  description: "Unreadable scan with no usable text layer. Must yield unknown, never fabricated evidence.",
  resumeText: "",
  job: layoutJob,
};

export const LAYOUT_CORPUS: LayoutFixture[] = [twoColumnInterleaved, twoColumnControl, scannedEmpty];
