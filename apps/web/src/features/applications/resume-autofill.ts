export type ResumeAutofillFields = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
  // Enriched heuristics (best-effort, no AI):
  skills?: string[];
  experienceYears?: number;
  education?: string;
};

type ExtractResumeAutofillFieldsInput = {
  fileName: string;
  text: string;
  /** Job keywords to also detect as skills, beyond the built-in lexicon. */
  jobKeywords?: string[];
  /** Override "now" for deterministic experience-from-date-range inference. */
  referenceYear?: number;
};

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phonePattern = /\+?\d[\d\s().-]{7,}\d/;
const urlPattern = /https?:\/\/[^\s)>,]+/gi;

// Curated, display-cased skill lexicon (tech-leaning + general). Matched
// case-insensitively with token boundaries so "java" != "javascript".
const SKILL_LEXICON = [
  "JavaScript", "TypeScript", "Python", "Java", "Kotlin", "Swift", "Go",
  "Rust", "Ruby", "PHP", "C++", "C#", "Scala", "Elixir", "Dart",
  "React", "Next.js", "Vue", "Nuxt", "Angular", "Svelte", "Node.js",
  "Express", "NestJS", "Django", "Flask", "FastAPI", "Spring", "Rails",
  "Laravel", ".NET", "Tailwind", "GraphQL", "tRPC", "REST",
  "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Prisma", "Drizzle",
  "Elasticsearch", "Kafka", "RabbitMQ", "SQL",
  "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "Ansible",
  "CI/CD", "Linux", "Nginx", "Cloudflare", "Vercel", "Serverless",
  "Git", "GitHub", "GitLab", "Jira", "Figma", "Sketch",
  "HTML", "CSS", "Sass", "Webpack", "Vite", "Jest", "Vitest", "Playwright",
  "Cypress", "Storybook",
  "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "NLP",
  "Pandas", "NumPy", "Data Analysis", "Power BI", "Tableau", "Excel",
  "Agile", "Scrum", "Kanban", "Leadership", "Communication",
  "Project Management", "Product Management", "SEO", "Marketing",
  "Salesforce", "HubSpot", "Accounting", "Recruiting",
];

const EDUCATION_LEVELS: { label: string; pattern: RegExp }[] = [
  { label: "PhD", pattern: /\b(ph\.?\s?d|doctor(?:ate|al)|doctorado)\b/i },
  {
    label: "Master's degree",
    pattern:
      /\b(master'?s?|m\.?\s?sc|m\.?\s?b\.?\s?a|mag[ií]ster|maestr[ií]a|postgrad(?:uate)?|posgrado)\b/i,
  },
  {
    label: "Bachelor's degree",
    pattern:
      /\b(bachelor'?s?|b\.?\s?sc|b\.?\s?a|b\.?\s?eng|licenciatura|licenciad[oa]|ingenier[ií]a|ingenier[oa]|undergraduate)\b/i,
  },
  {
    label: "Associate degree",
    pattern: /\b(associate'?s?\s+degree|t[eé]cnico|technician)\b/i,
  },
  {
    label: "High school",
    pattern: /\b(high\s+school|secondary\s+school|bachillerato|secundaria)\b/i,
  },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanToken(value: string) {
  return value
    .replace(/\.(pdf|docx?|rtf|resume|cv)$/gi, "")
    .replace(/\b(resume|cv)\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferName(input: ExtractResumeAutofillFieldsInput) {
  const lines = input.text
    .split(/\r?\n/)
    .map((line) => cleanToken(line))
    .filter((line) => line.length > 2 && !emailPattern.test(line));
  const candidateLine =
    lines.find((line) => /^[A-Za-zÀ-ÿ' -]{3,80}$/.test(line)) ??
    cleanToken(input.fileName);
  const parts = titleCase(candidateLine)
    .split(" ")
    .filter((part) => part.length > 1);

  if (parts.length === 0) {
    return {};
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || undefined,
  };
}

function inferLocation(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => cleanToken(line))
    .filter(Boolean);

  return (
    lines.find(
      (line) =>
        /,\s*[A-Za-zÀ-ÿ ]{2,}$/.test(line) &&
        !emailPattern.test(line) &&
        !urlPattern.test(line),
    ) ?? undefined
  );
}

/**
 * Match a skill token with boundaries that respect + and # (so C++ / C# work).
 * Dots are NOT boundary chars: skills carry their own dots (.NET, Node.js) and a
 * trailing sentence period must not block a match ("PostgreSQL.").
 */
function textIncludesSkill(text: string, skill: string) {
  const pattern = new RegExp(
    `(?<![a-z0-9+#])${escapeRegExp(skill)}(?![a-z0-9+#])`,
    "i",
  );
  return pattern.test(text);
}

function inferSkills(
  text: string,
  jobKeywords: string[] | undefined,
): string[] {
  if (!text.trim()) {
    return [];
  }

  const found: string[] = [];
  const seen = new Set<string>();

  const consider = (label: string) => {
    const key = label.toLowerCase();
    if (seen.has(key) || !label.trim()) {
      return;
    }
    if (textIncludesSkill(text, label)) {
      seen.add(key);
      found.push(label);
    }
  };

  // Job-specific keywords first (most relevant), then the built-in lexicon.
  for (const keyword of jobKeywords ?? []) {
    consider(keyword.trim());
  }
  for (const skill of SKILL_LEXICON) {
    consider(skill);
  }

  return found.slice(0, 30);
}

function inferExperienceYears(
  text: string,
  referenceYear: number,
): number | undefined {
  const phraseMatches = [
    ...text.matchAll(/(\d{1,2})\s*\+?\s*(?:years|yrs|year|años|año)\b/gi),
  ]
    .map((match) => Number(match[1]))
    .filter((value) => value > 0 && value <= 50);

  if (phraseMatches.length > 0) {
    return Math.max(...phraseMatches);
  }

  // Fallback: span from the earliest plausible year mentioned to "now".
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/g)]
    .map((match) => Number(match[0]))
    .filter((year) => year >= 1980 && year <= referenceYear);

  if (years.length > 0) {
    const span = referenceYear - Math.min(...years);
    if (span >= 1 && span <= 50) {
      return span;
    }
  }

  return undefined;
}

function inferEducation(text: string): string | undefined {
  for (const level of EDUCATION_LEVELS) {
    if (level.pattern.test(text)) {
      return level.label;
    }
  }
  return undefined;
}

export function extractResumeAutofillFields(
  input: ExtractResumeAutofillFieldsInput,
): ResumeAutofillFields {
  const urls = Array.from(input.text.matchAll(urlPattern)).map((match) =>
    match[0].replace(/[),.]+$/g, ""),
  );
  const name = inferName(input);
  const referenceYear = input.referenceYear ?? new Date().getFullYear();
  const skills = inferSkills(input.text, input.jobKeywords);

  return {
    ...name,
    email: input.text.match(emailPattern)?.[0],
    phone: input.text.match(phonePattern)?.[0]?.trim(),
    location: inferLocation(input.text),
    linkedinUrl: urls.find((url) => url.includes("linkedin.com")),
    githubUrl: urls.find((url) => url.includes("github.com")),
    websiteUrl: urls.find(
      (url) => !url.includes("linkedin.com") && !url.includes("github.com"),
    ),
    skills: skills.length > 0 ? skills : undefined,
    experienceYears: inferExperienceYears(input.text, referenceYear),
    education: inferEducation(input.text),
  };
}
