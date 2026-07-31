import "server-only";

export type HarlyKnowledgeEntry = {
  id: string;
  title: string;
  kind: "product" | "workflow" | "integration" | "policy";
  version: string;
  updatedAt: string;
  keywords: string[];
  content: string;
};

/**
 * Canonical product knowledge derived from the repository's public product
 * documentation. This is deliberately factual: it describes what Harly is,
 * what it supports, and what remains outside its scope. It must not be used
 * as a substitute for live workspace records.
 */

/**
 * Versioned product documentation for retrieval by Harly. Workspace records
 * and connection state must still come from dedicated tools; this source only
 * explains stable product behavior and policies.
 */
export const HARLY_PRODUCT_KNOWLEDGE: readonly HarlyKnowledgeEntry[] = [
  {
    id: "harly-identity-and-ownership",
    title: "Harly identity and Vytral context",
    kind: "product",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: ["harly", "vytral", "identity", "company", "open source", "ats"],
    content:
      "Harly is a self-hostable, open-source applicant tracking system (ATS) for startups, agencies, and technical teams. The repository is published under the Vytral organization. Harly must not invent legal, customer, financial, or internal-company facts that are not present in workspace settings or approved documentation.",
  },
  {
    id: "harly-product-north-star",
    title: "Harly AI product role",
    kind: "product",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: [
      "ai",
      "copilot",
      "teammate",
      "recruiter",
      "north star",
      "context",
    ],
    content:
      "Harly AI is the in-product recruiting copilot. Its role is to look at the same workspace and screen as the recruiter, explain real hiring evidence, recommend next steps, and propose consequential actions for confirmation. It is not a generic recruiting chatbot and it does not make final hiring decisions.",
  },
  {
    id: "harly-core-ats-workflows",
    title: "Core ATS workflows",
    kind: "workflow",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: [
      "jobs",
      "candidates",
      "applications",
      "pipeline",
      "interview",
      "offer",
      "hire",
    ],
    content:
      "The core workflow is: create and publish a job, receive and review applications, move candidates through the hiring pipeline, schedule and complete interviews, record feedback, send an offer, and close the role while preserving history. Harly also supports candidate profiles, notes, files, tags, talent pools, tasks, reports, notifications, audit history, and candidate portals.",
  },
  {
    id: "harly-public-careers",
    title: "Career pages and public jobs",
    kind: "workflow",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: [
      "career page",
      "board",
      "public",
      "seo",
      "widget",
      "job posting",
    ],
    content:
      "Each workspace can publish a canonical public board at /board/<workspace-slug>. Career pages support discovery and SEO metadata, public job pages, structured JobPosting data, and embeddable job widgets. A job's current public visibility and URL must always come from live workspace data, not this documentation.",
  },
  {
    id: "harly-candidate-intelligence",
    title: "Candidate review and AI evaluation",
    kind: "workflow",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: [
      "candidate",
      "resume",
      "score",
      "scorecard",
      "evidence",
      "review",
      "bias",
    ],
    content:
      "Harly can review candidate profiles, applications, resumes, notes, interviews, scorecards, and AI evaluations when available. AI scores are guidance and must not be the sole basis for a hiring decision. Reviews should state strengths, gaps, confidence, missing evidence, and a human-owned recommendation. Protected characteristics must never be used as evaluation criteria.",
  },
  {
    id: "harly-communication-and-scheduling",
    title: "Communication, interviews, and offers",
    kind: "workflow",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: [
      "email",
      "mailbox",
      "interview",
      "calendar",
      "offer",
      "signature",
      "schedule",
    ],
    content:
      "Harly supports recruiting email workflows, interview scheduling, calendar/video provider synchronization, offers, and electronic signature flows where configured. Drafting is different from sending. Scheduling and sending consequential communications require confirmation and must report partial provider failures accurately.",
  },
  {
    id: "harly-security-and-governance",
    title: "Security, privacy, and governance",
    kind: "policy",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: [
      "gdpr",
      "privacy",
      "rbac",
      "permissions",
      "audit",
      "retention",
      "consent",
      "security",
    ],
    content:
      "Harly is designed for self-hosting and workspace-scoped access. It supports role-based access control, organizations, SSO/SAML, passkeys, two-factor authentication, consent evidence, retention controls, audit trails, candidate export and erasure workflows, and private file storage. Harly provides compliance tooling, not legal advice; each organization remains responsible for its legal obligations and production configuration.",
  },
  {
    id: "harly-integrations-scope",
    title: "Integrations and capability boundaries",
    kind: "integration",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: [
      "google calendar",
      "cal.com",
      "slack",
      "outlook",
      "zoom",
      "email",
      "storage",
      "linkedin",
      "integration",
    ],
    content:
      "Harly has provider integrations for areas such as Google Calendar/Meet, Cal.com, Slack, Outlook/Teams, Zoom, email, storage, webhooks, and APIs, subject to workspace configuration and provider credentials. Integration availability is separate from product capability. Harly does not have a native LinkedIn Jobs publishing or LinkedIn applicant synchronization capability in the current product.",
  },
  {
    id: "harly-api-and-automation",
    title: "API, webhooks, and automation",
    kind: "product",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: ["api", "rest", "openapi", "webhook", "automation", "events"],
    content:
      "Harly exposes a versioned REST API, API keys, OpenAPI output, and outbound webhooks for supported automation and integrations. Harly AI may describe or use an action only when the corresponding server tool and permission exist; documentation alone never authorizes an external operation.",
  },
  {
    id: "harly-deployment-and-operations",
    title: "Deployment and operating model",
    kind: "product",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: [
      "self host",
      "postgres",
      "docker",
      "scheduler",
      "deployment",
      "backup",
      "open source",
    ],
    content:
      "Harly is self-hostable and uses PostgreSQL, a web application, persistent scheduling/background processing, and local or S3-compatible storage. It is currently described as a public beta for small self-hosted teams. Operators own infrastructure, backups, access controls, upgrades, and recovery; Harly does not promise a hosted SLA or managed recovery.",
  },
  {
    id: "harly-roadmap-boundaries",
    title: "Roadmap and explicit non-goals",
    kind: "policy",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: [
      "roadmap",
      "planned",
      "not planned",
      "custom pipeline",
      "sourcing",
      "linkedin",
    ],
    content:
      "Custom per-job pipelines, additional job-distribution adapters, assisted sourcing, and deeper personalization are roadmap areas rather than guaranteed current capabilities. Harly does not plan automatic hiring decisions without meaningful human review, unauthorized LinkedIn or social-network scraping, payroll/benefits/time tracking, or a proprietary professional-network database.",
  },
  {
    id: "product-grounding",
    title: "How Harly answers workspace questions",
    kind: "policy",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: ["truth", "workspace", "data", "source", "tool", "grounding"],
    content:
      "For questions about a specific workspace, job, candidate, integration, count, status, or date, Harly consults workspace-scoped tools first. General recruiting advice must be labeled as general advice and must not be presented as a fact about the workspace.",
  },
  {
    id: "job-publication-and-sharing",
    title: "Job publication and external sharing",
    kind: "workflow",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: [
      "job",
      "puesto",
      "publicar",
      "publicación",
      "publish",
      "career page",
      "linkedin",
      "share",
      "distribution",
      "nativo",
      "postulaciones",
    ],
    content:
      "Harly can expose the public Harly URL for a publicly visible job and open LinkedIn's share flow for that URL. Sharing a link creates a social post that points to Harly; it is not the same as creating a native LinkedIn Job. Harly does not currently create native LinkedIn Jobs or synchronize LinkedIn applicants.",
  },
  {
    id: "confirmed-actions",
    title: "Actions and confirmation",
    kind: "policy",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: ["action", "write", "confirm", "permission", "email", "schedule"],
    content:
      "Consequential changes require a confirmation card and effective permission. Harly resolves the current workspace record before proposing an action and must never claim success until the action result reports success.",
  },
  {
    id: "candidate-review",
    title: "Candidate review boundaries",
    kind: "policy",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: ["candidate", "review", "score", "evidence", "decision", "bias"],
    content:
      "Candidate reviews summarize evidence from the candidate profile, application, resume, scorecards, notes, and AI evaluation when present. Harly can provide a recommendation and missing evidence, but the human makes the final hiring decision. Protected characteristics must not be used as evaluation criteria.",
  },
  {
    id: "integrations-and-secrets",
    title: "Integration status and secrets",
    kind: "integration",
    version: "1.0",
    updatedAt: "2026-07-31",
    keywords: [
      "integration",
      "connected",
      "reconnect",
      "secret",
      "token",
      "calendar",
    ],
    content:
      "Harly can report safe workspace-scoped integration status and reconnect guidance. It never reveals tokens, API keys, credentials, or private provider payloads. Connection status is separate from whether the product supports a capability.",
  },
];

function normalize(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

export function searchHarlyProductKnowledge(
  query: string,
  limit = 5,
): HarlyKnowledgeEntry[] {
  const queryTokens = normalize(query);
  if (queryTokens.length === 0) return [];

  return HARLY_PRODUCT_KNOWLEDGE.map((entry) => {
    const haystack = normalize(
      `${entry.title} ${entry.keywords.join(" ")} ${entry.content}`,
    );
    const score = queryTokens.reduce(
      (total, token) => total + (haystack.includes(token) ? 1 : 0),
      0,
    );
    return { entry, score };
  })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(limit, 10)))
    .map((item) => item.entry);
}

/**
 * Small always-on product context. Retrieval remains available for detailed
 * questions, but identity and hard boundaries must not depend on the model
 * choosing to call a tool first.
 */
export function getHarlyCoreProductContext(): string {
  return HARLY_PRODUCT_KNOWLEDGE.filter((entry) =>
    [
      "harly-identity-and-ownership",
      "harly-product-north-star",
      "harly-core-ats-workflows",
      "harly-integrations-scope",
      "harly-security-and-governance",
      "harly-roadmap-boundaries",
    ].includes(entry.id),
  )
    .map((entry) => `${entry.title}: ${entry.content}`)
    .join("\n");
}
