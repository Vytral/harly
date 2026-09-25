import { Buffer } from "node:buffer";

/**
 * Fictional resume generator for demo seeding. Builds a real (tiny) PDF per
 * candidate — no dependencies — so the in-app PDF viewer, text extraction and
 * AI scoring all have genuine content to work with.
 */

type ResumeCandidate = {
  firstName: string;
  lastName: string;
  email: string;
  location: string;
  headline: string;
  github?: string;
  website?: string;
};

type Track =
  | "frontend"
  | "backend"
  | "devops"
  | "design"
  | "marketing"
  | "support"
  | "sales"
  | "fullstack";

function trackFor(headline: string): Track {
  const h = headline.toLowerCase();
  if (h.includes("full-stack") || h.includes("fullstack")) return "fullstack";
  if (h.includes("frontend")) return "frontend";
  if (h.includes("backend") || h.includes("platform")) return "backend";
  if (h.includes("devops") || h.includes("sre")) return "devops";
  if (h.includes("design")) return "design";
  if (h.includes("market") || h.includes("growth") || h.includes("content"))
    return "marketing";
  if (h.includes("support") || h.includes("customer")) return "support";
  if (h.includes("sdr") || h.includes("sales")) return "sales";
  return "fullstack";
}

const COMPANIES = [
  "Nimbus Labs",
  "Quokka Cloud",
  "Vector Systems",
  "Brightline",
  "Mosaic HQ",
  "Northwind Digital",
  "Atlas Forge",
  "Lumen & Co",
  "Driftwood Software",
  "Kepler Works",
];

const SCHOOLS = [
  "State University of Technology",
  "Metropolitan Institute of Design",
  "Riverside University",
  "National Polytechnic",
  "Westfield College",
];

const TRACK_DATA: Record<
  Track,
  {
    titles: [string, string, string];
    skills: string[];
    degree: string;
    bullets: (company: string) => string[][];
  }
> = {
  frontend: {
    titles: ["Senior Frontend Engineer", "Frontend Engineer", "UI Engineer"],
    skills: [
      "React, Next.js, TypeScript",
      "Design systems, Storybook, Tailwind CSS",
      "Web performance (Core Web Vitals), accessibility (WCAG 2.2)",
      "Testing: Vitest, Playwright, React Testing Library",
    ],
    degree: "B.Sc. Computer Science",
    bullets: (c) => [
      [
        `Led the migration of ${c}'s dashboard to Next.js App Router, cutting Largest Contentful Paint from 3.8s to 1.2s.`,
        "Built and maintained a 40-component design system used by 6 product teams.",
        "Mentored 3 junior engineers; introduced visual regression testing that caught 30+ UI bugs pre-release.",
      ],
      [
        "Shipped the customer-facing analytics module (React, D3) used by 12k weekly active users.",
        "Reduced bundle size 45% through code-splitting and dependency audits.",
      ],
      [
        "Implemented responsive marketing pages and A/B test variants that lifted signup conversion 18%.",
      ],
    ],
  },
  backend: {
    titles: ["Senior Backend Engineer", "Backend Engineer", "Software Engineer"],
    skills: [
      "Go, PostgreSQL, gRPC, REST API design",
      "Distributed systems: queues, idempotency, event-driven architecture",
      "Observability: OpenTelemetry, Grafana, structured logging",
      "Docker, Kubernetes, CI/CD pipelines",
    ],
    degree: "B.Sc. Software Engineering",
    bullets: (c) => [
      [
        `Designed ${c}'s billing service in Go handling 2M invoices/month with zero double-charge incidents.`,
        "Cut p99 API latency from 900ms to 140ms by introducing read replicas and query plan fixes.",
        "Owned the migration from a monolith to 8 services; wrote the internal RFC process used since.",
      ],
      [
        "Built a gRPC ingestion pipeline processing 40k events/sec with exactly-once semantics.",
        "Introduced contract testing across services, eliminating a class of integration regressions.",
      ],
      [
        "Maintained PostgreSQL schemas and migrations for the core product; led the upgrade to partitioned tables.",
      ],
    ],
  },
  devops: {
    titles: ["Senior DevOps Engineer", "Site Reliability Engineer", "Platform Engineer"],
    skills: [
      "Kubernetes, Helm, Terraform, AWS (EKS, RDS, S3)",
      "CI/CD: GitHub Actions, ArgoCD, progressive delivery",
      "Incident response, SLOs, on-call leadership",
      "Python & Bash automation",
    ],
    degree: "B.Sc. Computer Engineering",
    bullets: (c) => [
      [
        `Ran ${c}'s Kubernetes platform (60 services, 4 clusters) with 99.97% availability over 2 years.`,
        "Cut infrastructure spend 32% via rightsizing, spot pools and storage lifecycle policies.",
        "Authored Terraform modules adopted org-wide; infra changes went from days to under an hour.",
      ],
      [
        "Built blue/green deploy pipelines that took release rollbacks from 30 minutes to 90 seconds.",
        "Led post-incident reviews and drove MTTR down 40% year over year.",
      ],
      [
        "Automated environment provisioning for preview deploys on every pull request.",
      ],
    ],
  },
  design: {
    titles: ["Senior Product Designer", "Product Designer", "UX Designer"],
    skills: [
      "Figma (advanced prototyping, design tokens, variables)",
      "Design systems governance and documentation",
      "User research: interviews, usability testing, surveys",
      "Motion design and micro-interactions",
    ],
    degree: "B.A. Interaction Design",
    bullets: (c) => [
      [
        `Redesigned ${c}'s onboarding flow; activation rate rose from 34% to 52% in one quarter.`,
        "Owned the design system (tokens, components, docs) consumed by 5 squads.",
        "Ran 60+ user interviews and turned findings into a quarterly insight report for product leadership.",
      ],
      [
        "Designed the mobile-first checkout that now accounts for 61% of revenue.",
        "Partnered with engineering on a motion language that unified 20+ transitions.",
      ],
      [
        "Produced brand-aligned marketing pages and illustration guidelines.",
      ],
    ],
  },
  marketing: {
    titles: ["Growth Marketing Manager", "Marketing Manager", "Content Marketer"],
    skills: [
      "Lifecycle marketing: email, in-product, push (Customer.io, Braze)",
      "Paid acquisition: Google Ads, LinkedIn, Meta — $1M+ annual budget",
      "SEO and content strategy; analytics with GA4, Amplitude",
      "Experiment design and statistics fundamentals",
    ],
    degree: "B.A. Business & Marketing",
    bullets: (c) => [
      [
        `Grew ${c}'s self-serve pipeline 3.2x in 18 months through SEO, lifecycle email and referral loops.`,
        "Cut blended CAC 28% by reallocating paid spend based on cohort LTV analysis.",
        "Launched a content engine (2 posts/week) that became the #1 acquisition channel.",
      ],
      [
        "Owned activation experiments; 14 of 31 A/B tests shipped with significant lift.",
        "Built the marketing analytics stack from scratch (GA4, Amplitude, dbt).",
      ],
      [
        "Managed social and community programs reaching 80k followers.",
      ],
    ],
  },
  support: {
    titles: ["Customer Support Lead", "Technical Support Specialist", "Support Engineer"],
    skills: [
      "Zendesk, Intercom, internal tooling; SQL for investigation",
      "Technical troubleshooting: APIs, webhooks, DNS, billing systems",
      "Knowledge-base authoring and support enablement",
      "Escalation management and on-call coordination",
    ],
    degree: "B.Sc. Information Systems",
    bullets: (c) => [
      [
        `Led a 6-person support team at ${c}; CSAT held at 96% while ticket volume doubled.`,
        "Cut first-response time from 6h to 45min by redesigning triage and macros.",
        "Wrote 120+ knowledge-base articles deflecting an estimated 30% of inbound tickets.",
      ],
      [
        "Handled tier-2 technical escalations (API, webhooks, data issues) end to end.",
        "Built the bug-report pipeline with engineering, halving time-to-fix for customer-reported issues.",
      ],
      [
        "Onboarded and trained new support hires; created the internal certification track.",
      ],
    ],
  },
  sales: {
    titles: ["Sales Development Representative", "SDR", "Business Development Rep"],
    skills: [
      "Outbound prospecting: cold email, calling, LinkedIn (Outreach, Apollo)",
      "CRM hygiene and pipeline management (Salesforce, HubSpot)",
      "Discovery calls and qualification (MEDDICC)",
      "Account research and personalization at scale",
    ],
    degree: "B.A. Communications",
    bullets: (c) => [
      [
        `Top SDR at ${c} for 4 consecutive quarters; 132% average quota attainment.`,
        "Booked 290+ qualified meetings; sourced $1.8M in closed-won pipeline.",
        "Designed the outbound sequences now used as the team default (38% open, 11% reply).",
      ],
      [
        "Ran outbound for the EMEA expansion, opening 40 enterprise conversations in 6 months.",
        "Mentored 2 new SDRs to full ramp in under 8 weeks.",
      ],
      [
        "Maintained 98% CRM data accuracy across 1,200 owned accounts.",
      ],
    ],
  },
  fullstack: {
    titles: ["Senior Full-stack Engineer", "Full-stack Engineer", "Software Developer"],
    skills: [
      "TypeScript, React, Node.js, PostgreSQL",
      "API design (REST, tRPC), background jobs, caching",
      "Testing across the stack; CI/CD ownership",
      "Cloud deployment: Vercel, AWS, Docker",
    ],
    degree: "B.Sc. Computer Science",
    bullets: (c) => [
      [
        `Built ${c}'s customer portal end to end (React, Node, Postgres) serving 25k monthly users.`,
        "Owned features from spec to production across frontend, API and database layers.",
        "Introduced typed API contracts that eliminated an entire class of runtime errors.",
      ],
      [
        "Shipped the notification system (email + in-app) with queue-backed delivery and retries.",
        "Improved CI from 22min to 7min through caching and test sharding.",
      ],
      [
        "Maintained integrations with Stripe, Slack and Google Calendar.",
      ],
    ],
  },
};

/** Deterministic resume content for one candidate. */
export function buildResumeLines(
  cand: ResumeCandidate,
  index: number,
): { lines: Array<{ text: string; bold?: boolean; gap?: number }>; fileName: string } {
  const track = trackFor(cand.headline);
  const data = TRACK_DATA[track];
  const fullName = `${cand.firstName} ${cand.lastName}`;
  const company = (offset: number) => COMPANIES[(index + offset) % COMPANIES.length];
  const school = SCHOOLS[index % SCHOOLS.length];
  const seniorYears = 8 - (index % 4);
  const year = (ago: number) => 2026 - ago;

  const jobs = [
    { title: data.titles[0], company: company(0), from: year(3), to: "Present" as const },
    { title: data.titles[1], company: company(3), from: year(6), to: year(3) },
    { title: data.titles[2], company: company(6), from: year(seniorYears), to: year(6) },
  ];

  const lines: Array<{ text: string; bold?: boolean; gap?: number }> = [
    { text: fullName, bold: true },
    { text: cand.headline },
    {
      text: `${cand.location} · ${cand.email}${cand.github ? ` · ${cand.github}` : cand.website ? ` · ${cand.website}` : ""}`,
    },
    { text: "", gap: 8 },
    { text: "EXPERIENCE", bold: true },
  ];

  jobs.forEach((job, j) => {
    lines.push({ text: "", gap: 4 });
    lines.push({
      text: `${job.title} — ${job.company} (${job.from}–${job.to})`,
      bold: true,
    });
    for (const bullet of data.bullets(job.company)[j] ?? []) {
      lines.push({ text: `  •  ${bullet}` });
    }
  });

  lines.push({ text: "", gap: 8 });
  lines.push({ text: "SKILLS", bold: true });
  for (const skill of data.skills) {
    lines.push({ text: `  •  ${skill}` });
  }

  lines.push({ text: "", gap: 8 });
  lines.push({ text: "EDUCATION", bold: true });
  lines.push({
    text: `${data.degree} — ${school} (${year(seniorYears + 4)}–${year(seniorYears)})`,
  });

  const fileName = `${cand.firstName}-${cand.lastName}-CV.pdf`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9.-]/g, "-");

  return { lines, fileName };
}

function escapePdfText(text: string): string {
  // Helvetica is WinAnsi-encoded; strip combining marks for unmapped chars.
  const flat = text.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return flat
    .replace(/[—–]/g, "-")
    .replace(/•/g, "-")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\xff]/g, "?");
}

/** Wrap a line to fit the page (rough Helvetica width heuristic). */
function wrapLine(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) out.push(current);
      current = text.startsWith("  •  ") ? "       " + word : word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Minimal single-font PDF writer (Helvetica / Helvetica-Bold, multi-page).
 * Produces a spec-valid PDF readable by browsers and text extractors.
 */
export function linesToPdf(
  lines: Array<{ text: string; bold?: boolean; gap?: number }>,
): Buffer {
  const fontSize = 10;
  const leading = 15;
  const top = 760;
  const bottom = 50;
  const left = 50;
  const maxChars = 95;

  // Flatten into positioned rows, paginating as we go.
  const pages: string[][] = [[]];
  let y = top;
  for (const line of lines) {
    const wrapped = line.text === "" ? [""] : wrapLine(line.text, maxChars);
    for (const segment of wrapped) {
      y -= leading + (line.gap ?? 0);
      if (y < bottom) {
        pages.push([]);
        y = top - leading;
      }
      if (segment !== "") {
        const font = line.bold ? "F2" : "F1";
        pages[pages.length - 1].push(
          `BT /${font} ${line.bold && pages[0].length === 0 ? 16 : fontSize} Tf ${left} ${y} Td (${escapePdfText(segment)}) Tj ET`,
        );
      }
    }
  }

  const objects: string[] = [];
  const pageCount = pages.length;
  // Object layout: 1 catalog, 2 pages, 3..(2+n) page objs, then n content
  // streams, then 2 fonts.
  const contentObjStart = 3 + pageCount;
  const fontRegular = contentObjStart + pageCount;
  const fontBold = fontRegular + 1;

  objects.push(`1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj`);
  const kids = pages.map((_, i) => `${3 + i} 0 R`).join(" ");
  objects.push(
    `2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pageCount} >> endobj`,
  );
  pages.forEach((_, i) => {
    objects.push(
      `${3 + i} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentObjStart + i} 0 R >> endobj`,
    );
  });
  pages.forEach((rows, i) => {
    const stream = rows.join("\n");
    objects.push(
      `${contentObjStart + i} 0 obj << /Length ${Buffer.byteLength(stream, "latin1")} >> stream\n${stream}\nendstream endobj`,
    );
  });
  objects.push(
    `${fontRegular} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj`,
  );
  objects.push(
    `${fontBold} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj`,
  );

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += obj + "\n";
  }
  const xrefStart = Buffer.byteLength(body, "latin1");
  const count = objects.length + 1;
  body += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(body, "latin1");
}
