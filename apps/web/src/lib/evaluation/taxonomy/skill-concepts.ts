/**
 * Skill Concept Layer & Normalization Taxonomy for Harly ATS.
 *
 * Implements Phase 1 of the ATS Evolution Roadmap:
 * - Canonical concept IDs and names (e.g. React, PostgreSQL, TypeScript)
 * - Built-in canonical alias maps (e.g. React.js -> React, Postgres -> PostgreSQL, TS -> TypeScript)
 * - Support for recruiter-defined aliases
 * - Clear separation between equivalent concepts and related (non-equivalent) concepts
 * - Strict preservation of technical symbols (+, #, .)
 */

/** Version of the built-in skill taxonomy (Audit doc §5.1, §8.5). Bump when concepts/aliases change. */
export const SKILL_TAXONOMY_VERSION = "skill-taxonomy-v2";

export type SkillCategory =
  | "frontend"
  | "backend"
  | "mobile"
  | "data"
  | "devops_cloud"
  | "security"
  | "product"
  | "design"
  | "marketing"
  | "sales"
  | "management"
  | "general";

export interface SkillConcept {
  id: string;
  canonicalName: string;
  aliases: string[];
  category?: SkillCategory;
  /** Related skills that must NOT be treated as interchangeable equivalents */
  relatedSkills?: string[];
}

export interface SkillResolutionResult {
  conceptId?: string;
  canonicalName: string;
  searchTokens: string[];
  method: "deterministic_exact" | "built_in_alias" | "recruiter_alias";
  category?: SkillCategory;
}

/**
 * Built-in standard taxonomy of ATS skill concepts across Engineering, Data, Cloud,
 * Marketing, Product, and Sales.
 */
export const BUILT_IN_SKILL_CONCEPTS: SkillConcept[] = [
  // --- FRONTEND ---
  {
    id: "skill:react",
    canonicalName: "React",
    aliases: ["React.js", "ReactJS", "React.JS"],
    category: "frontend",
    relatedSkills: ["Next.js", "React Native"],
  },
  {
    id: "skill:nextjs",
    canonicalName: "Next.js",
    // "Next" alone is too ambiguous for alias equivalence (Next.js ≠ next steps).
    aliases: ["NextJS", "Next.JS"],
    category: "frontend",
    relatedSkills: ["React"],
  },
  {
    id: "skill:vue",
    canonicalName: "Vue",
    aliases: ["Vue.js", "VueJS", "Vue.JS"],
    category: "frontend",
    relatedSkills: ["Nuxt"],
  },
  {
    id: "skill:nuxt",
    canonicalName: "Nuxt",
    aliases: ["Nuxt.js", "NuxtJS", "Nuxt.JS"],
    category: "frontend",
    relatedSkills: ["Vue"],
  },
  {
    id: "skill:angular",
    canonicalName: "Angular",
    // AngularJS is a different framework — related, never equivalent.
    aliases: ["Angular 2+", "Angular2", "Angular 2"],
    category: "frontend",
    relatedSkills: ["AngularJS"],
  },
  {
    id: "skill:angularjs",
    canonicalName: "AngularJS",
    aliases: ["Angular.js", "Angular 1", "AngularJS 1"],
    category: "frontend",
    relatedSkills: ["Angular"],
  },
  {
    id: "skill:svelte",
    canonicalName: "Svelte",
    aliases: ["SvelteKit", "Svelte.js"],
    category: "frontend",
  },
  {
    id: "skill:typescript",
    canonicalName: "TypeScript",
    aliases: ["TS", "Type Script"],
    category: "frontend",
    relatedSkills: ["JavaScript"],
  },
  {
    id: "skill:javascript",
    canonicalName: "JavaScript",
    aliases: ["JS", "ECMAScript", "ES6", "ES2015", "Vanilla JS"],
    category: "frontend",
    relatedSkills: ["TypeScript"],
  },
  {
    id: "skill:html",
    canonicalName: "HTML",
    aliases: ["HTML5"],
    category: "frontend",
  },
  {
    id: "skill:css",
    canonicalName: "CSS",
    aliases: ["CSS3"],
    category: "frontend",
    relatedSkills: ["Sass", "SCSS", "Tailwind", "Tailwind CSS"],
  },
  {
    id: "skill:sass",
    canonicalName: "Sass",
    aliases: ["SCSS", "Sassy CSS"],
    category: "frontend",
    relatedSkills: ["CSS"],
  },
  {
    id: "skill:tailwind",
    canonicalName: "Tailwind CSS",
    aliases: ["Tailwind", "TailwindCSS"],
    category: "frontend",
    relatedSkills: ["CSS"],
  },
  {
    id: "skill:redux",
    canonicalName: "Redux",
    aliases: ["Redux Toolkit", "RTK"],
    category: "frontend",
  },
  {
    id: "skill:graphql",
    canonicalName: "GraphQL",
    aliases: ["Apollo", "Apollo GraphQL"],
    category: "frontend",
  },

  // --- BACKEND ---
  {
    id: "skill:nodejs",
    canonicalName: "Node.js",
    // Bare "Node" is ambiguous in free text; keep NodeJS / Node.JS only.
    aliases: ["NodeJS", "Node.JS"],
    category: "backend",
  },
  {
    id: "skill:python",
    canonicalName: "Python",
    // Drop short "Py" alias — too ambiguous for free-text scans.
    aliases: ["Python 3", "Python3"],
    category: "backend",
  },
  {
    id: "skill:golang",
    canonicalName: "Go",
    // Prefer Golang for alias lookup; short "Go" stays canonical but scanners
    // must use word-boundary / short-token guards (see matchSkillConceptsInText).
    aliases: ["Golang", "Go Lang"],
    category: "backend",
  },
  {
    id: "skill:rust",
    canonicalName: "Rust",
    aliases: ["RustLang"],
    category: "backend",
  },
  {
    id: "skill:java",
    canonicalName: "Java",
    aliases: ["Java 8", "Java 11", "Java 17", "Java 21"],
    category: "backend",
    relatedSkills: ["Kotlin"],
  },
  {
    id: "skill:cpp",
    canonicalName: "C++",
    aliases: ["Cpp"],
    category: "backend",
    relatedSkills: ["C"],
  },
  {
    id: "skill:csharp",
    canonicalName: "C#",
    aliases: ["CSharp", "C-Sharp"],
    category: "backend",
    relatedSkills: [".NET"],
  },
  {
    id: "skill:dotnet",
    canonicalName: ".NET",
    aliases: [".NET Core", "dotnet", "ASP.NET", "ASP.NET Core"],
    category: "backend",
    relatedSkills: ["C#"],
  },
  {
    id: "skill:ruby",
    canonicalName: "Ruby",
    aliases: ["Ruby MRI"],
    category: "backend",
    relatedSkills: ["Ruby on Rails", "Rails"],
  },
  {
    id: "skill:rails",
    canonicalName: "Ruby on Rails",
    aliases: ["Rails", "RoR"],
    category: "backend",
    relatedSkills: ["Ruby"],
  },
  {
    id: "skill:php",
    canonicalName: "PHP",
    aliases: ["PHP7", "PHP8"],
    category: "backend",
    relatedSkills: ["Laravel", "Symfony"],
  },
  {
    id: "skill:laravel",
    canonicalName: "Laravel",
    aliases: ["Laravel PHP"],
    category: "backend",
    relatedSkills: ["PHP"],
  },
  {
    id: "skill:symfony",
    canonicalName: "Symfony",
    aliases: ["Symfony PHP"],
    category: "backend",
    relatedSkills: ["PHP"],
  },
  {
    id: "skill:django",
    canonicalName: "Django",
    aliases: ["Django REST Framework", "DRF"],
    category: "backend",
  },
  {
    id: "skill:fastapi",
    canonicalName: "FastAPI",
    aliases: ["Fast API"],
    category: "backend",
  },
  {
    id: "skill:spring-boot",
    canonicalName: "Spring Boot",
    aliases: ["Spring", "Spring Framework"],
    category: "backend",
  },

  // --- DATA & DATABASES ---
  {
    id: "skill:postgresql",
    canonicalName: "PostgreSQL",
    aliases: ["Postgres", "PostgreSQL DB", "psql"],
    category: "data",
  },
  {
    id: "skill:mysql",
    canonicalName: "MySQL",
    aliases: ["MySQL DB"],
    category: "data",
    relatedSkills: ["MariaDB"],
  },
  {
    id: "skill:mariadb",
    canonicalName: "MariaDB",
    aliases: ["Maria DB"],
    category: "data",
    relatedSkills: ["MySQL"],
  },
  {
    id: "skill:mongodb",
    canonicalName: "MongoDB",
    aliases: ["Mongo"],
    category: "data",
  },
  {
    id: "skill:redis",
    canonicalName: "Redis",
    aliases: ["Redis Cache"],
    category: "data",
  },
  {
    id: "skill:sql",
    canonicalName: "SQL",
    aliases: ["Relational Database", "RDBMS", "T-SQL", "PL/SQL"],
    category: "data",
  },
  {
    id: "skill:kafka",
    canonicalName: "Kafka",
    aliases: ["Apache Kafka"],
    category: "data",
  },
  {
    id: "skill:spark",
    canonicalName: "Spark",
    aliases: ["Apache Spark", "PySpark"],
    category: "data",
  },
  {
    id: "skill:snowflake",
    canonicalName: "Snowflake",
    aliases: ["Snowflake DB"],
    category: "data",
  },

  // --- CLOUD & DEVOPS ---
  {
    id: "skill:docker",
    canonicalName: "Docker",
    aliases: ["Containerization", "Containers"],
    category: "devops_cloud",
    relatedSkills: ["Kubernetes"],
  },
  {
    id: "skill:kubernetes",
    canonicalName: "Kubernetes",
    aliases: ["K8s"],
    category: "devops_cloud",
    // Managed K8s offerings are related platforms, not the same skill claim.
    relatedSkills: ["Docker", "EKS", "GKE", "AKS"],
  },
  {
    id: "skill:eks",
    canonicalName: "EKS",
    aliases: ["Amazon EKS", "Elastic Kubernetes Service"],
    category: "devops_cloud",
    relatedSkills: ["Kubernetes", "GKE", "AKS"],
  },
  {
    id: "skill:gke",
    canonicalName: "GKE",
    aliases: ["Google Kubernetes Engine"],
    category: "devops_cloud",
    relatedSkills: ["Kubernetes", "EKS", "AKS"],
  },
  {
    id: "skill:aks",
    canonicalName: "AKS",
    aliases: ["Azure Kubernetes Service"],
    category: "devops_cloud",
    relatedSkills: ["Kubernetes", "EKS", "GKE"],
  },
  {
    id: "skill:aws",
    canonicalName: "AWS",
    aliases: ["Amazon Web Services", "Amazon AWS"],
    category: "devops_cloud",
  },
  {
    id: "skill:gcp",
    canonicalName: "GCP",
    aliases: ["Google Cloud Platform", "Google Cloud"],
    category: "devops_cloud",
  },
  {
    id: "skill:azure",
    canonicalName: "Azure",
    aliases: ["Microsoft Azure"],
    category: "devops_cloud",
  },
  {
    id: "skill:terraform",
    canonicalName: "Terraform",
    aliases: ["IaC", "Infrastructure as Code"],
    category: "devops_cloud",
  },
  {
    id: "skill:ci-cd",
    canonicalName: "CI/CD",
    aliases: ["Continuous Integration", "GitHub Actions", "GitLab CI", "CircleCI", "Jenkins"],
    category: "devops_cloud",
  },
  {
    id: "skill:linux",
    canonicalName: "Linux",
    aliases: ["Ubuntu", "Debian", "CentOS", "RHEL"],
    category: "devops_cloud",
  },

  // --- PRODUCT, DESIGN & BUSINESS ---
  {
    id: "skill:seo",
    canonicalName: "SEO",
    aliases: ["Search Engine Optimization", "Posicionamiento SEO", "Organic Search"],
    category: "marketing",
  },
  {
    id: "skill:sem",
    canonicalName: "SEM",
    aliases: ["Search Engine Marketing", "Google Ads", "Paid Search"],
    category: "marketing",
  },
  {
    id: "skill:paid-acquisition",
    canonicalName: "Paid Acquisition",
    aliases: [
      "Paid Spend",
      "Paid Ads",
      "Performance Marketing",
      "Meta Ads",
      "Facebook Ads",
      "CAC",
    ],
    category: "marketing",
  },
  {
    id: "skill:product-management",
    canonicalName: "Product Management",
    aliases: ["Product Strategy", "Roadmapping", "Product Lifecycle"],
    category: "product",
  },
  {
    id: "skill:ui-ux",
    canonicalName: "UI/UX",
    aliases: ["UI Design", "UX Design", "Figma", "User Experience", "User Interface"],
    category: "design",
  },
  {
    id: "skill:crm",
    canonicalName: "CRM",
    aliases: ["HubSpot", "Salesforce", "Customer Relationship Management"],
    category: "sales",
  },
  {
    id: "skill:agile",
    canonicalName: "Agile",
    aliases: ["Scrum", "Kanban", "Sprint Planning"],
    category: "management",
  },
];

// Normalize text for dictionary lookup
function normalizeLookupKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s\-_.]+/g, "")
    .trim();
}

// Build pre-indexed lookup maps for O(1) matching
const CANONICAL_MAP = new Map<string, SkillConcept>();
const ALIAS_MAP = new Map<string, SkillConcept>();

for (const concept of BUILT_IN_SKILL_CONCEPTS) {
  CANONICAL_MAP.set(normalizeLookupKey(concept.canonicalName), concept);
  for (const alias of concept.aliases) {
    ALIAS_MAP.set(normalizeLookupKey(alias), concept);
  }
}

/**
 * Normalizes a raw skill or requirement term against canonical concepts and recruiter aliases.
 */
export function resolveSkillConcept(
  rawTerm: string,
  recruiterAliases?: string[],
): SkillResolutionResult {
  const trimmed = rawTerm.trim();
  const lookupKey = normalizeLookupKey(trimmed);

  // 1. Direct Canonical Match
  const canonicalConcept = CANONICAL_MAP.get(lookupKey);
  if (canonicalConcept) {
    const tokens = [
      canonicalConcept.canonicalName,
      ...canonicalConcept.aliases,
      ...(recruiterAliases ?? []),
    ];
    return {
      conceptId: canonicalConcept.id,
      canonicalName: canonicalConcept.canonicalName,
      searchTokens: [...new Set(tokens)],
      method: "deterministic_exact",
      category: canonicalConcept.category,
    };
  }

  // 2. Built-in Alias Match
  const aliasConcept = ALIAS_MAP.get(lookupKey);
  if (aliasConcept) {
    const tokens = [
      aliasConcept.canonicalName,
      ...aliasConcept.aliases,
      ...(recruiterAliases ?? []),
    ];
    return {
      conceptId: aliasConcept.id,
      canonicalName: aliasConcept.canonicalName,
      searchTokens: [...new Set(tokens)],
      method: "built_in_alias",
      category: aliasConcept.category,
    };
  }

  // 3. Recruiter Alias or Unresolved custom skill
  const tokens = [trimmed, ...(recruiterAliases ?? [])];
  return {
    canonicalName: trimmed,
    searchTokens: [...new Set(tokens)],
    method: recruiterAliases && recruiterAliases.length > 0 ? "recruiter_alias" : "deterministic_exact",
  };
}

/**
 * Checks if candidateSkill is merely related to targetSkill rather than equivalent.
 */
export function isRelatedButNotEquivalent(targetSkill: string, candidateSkill: string): boolean {
  const targetKey = normalizeLookupKey(targetSkill);
  const targetConcept =
    CANONICAL_MAP.get(targetKey) ?? ALIAS_MAP.get(targetKey);
  if (!targetConcept?.relatedSkills?.length) return false;

  const candidateKey = normalizeLookupKey(candidateSkill);
  const candidateConcept =
    CANONICAL_MAP.get(candidateKey) ?? ALIAS_MAP.get(candidateKey);
  const candidateNames = new Set<string>([candidateKey]);
  if (candidateConcept) {
    candidateNames.add(normalizeLookupKey(candidateConcept.canonicalName));
    for (const alias of candidateConcept.aliases) {
      candidateNames.add(normalizeLookupKey(alias));
    }
  }

  return targetConcept.relatedSkills.some((related) => {
    const relatedKey = normalizeLookupKey(related);
    if (candidateNames.has(relatedKey)) return true;
    const relatedConcept =
      CANONICAL_MAP.get(relatedKey) ?? ALIAS_MAP.get(relatedKey);
    if (!relatedConcept) return false;
    return (
      candidateNames.has(normalizeLookupKey(relatedConcept.canonicalName)) ||
      relatedConcept.aliases.some((alias) => candidateNames.has(normalizeLookupKey(alias))) ||
      (candidateConcept != null && relatedConcept.id === candidateConcept.id)
    );
  });
}

/** Related concept labels for a target skill (never treated as automatic met). */
export function relatedSkillLabels(targetSkill: string): string[] {
  const key = normalizeLookupKey(targetSkill);
  const concept = CANONICAL_MAP.get(key) ?? ALIAS_MAP.get(key);
  return concept?.relatedSkills ? [...concept.relatedSkills] : [];
}

const SUPPORTED_SYMBOL_CHARS = new Set(["+", "#", "."]);

/** Multi-word n-gram window used when scanning free text for known concepts. */
const MAX_CONCEPT_WORDS = 3;

/**
 * Splits a free-text fragment into candidate skill tokens while preserving
 * technical symbols required by the acceptance matrix (C++, C#, .NET, Node.js).
 * Stops at sentence punctuation so achievements stay segmented.
 */
export function tokenizeSkillText(text: string): string[] {
  const tokens: string[] = [];
  let current = "";

  const flush = () => {
    const cleaned = current.trim().replace(/^[,;:()]+|[,;:()]+$/g, "");
    current = "";
    if (cleaned.length >= 2) tokens.push(cleaned);
  };

  for (const char of text) {
    if (/[a-zA-Z0-9]/.test(char) || SUPPORTED_SYMBOL_CHARS.has(char)) {
      current += char;
    } else {
      flush();
    }
  }
  flush();

  return tokens;
}

/**
 * Scans free text for known skill concepts (canonical names or aliases) and
 * returns every distinct resolution found. Preserves technical symbols and
 * tries multi-word n-grams so "Machine Learning" / "Node.js" resolve correctly.
 */
export function matchSkillConceptsInText(
  text: string,
  recruiterAliases?: string[],
): SkillResolutionResult[] {
  const words = tokenizeSkillText(text);
  const found = new Map<string, SkillResolutionResult>();

  const record = (term: string) => {
    const trimmed = term.trim();
    // Short ambiguous tokens (Go, JS, TS, Next) must not auto-hit from free text
    // unless they carry a tech symbol (C++, C#) or are multi-char acronyms with
    // digits / punctuation. Explicit criterion labels still resolve via resolveSkillConcept.
    const compact = trimmed.replace(/[\s\-_.]+/g, "");
    if (compact.length <= 2 && !/[+#.]/.test(trimmed)) {
      return;
    }
    if (/^(go|next|node|js|ts|py)$/i.test(compact)) {
      return;
    }
    const resolved = resolveSkillConcept(trimmed, recruiterAliases);
    if (resolved.conceptId && !found.has(resolved.conceptId)) {
      found.set(resolved.conceptId, { ...resolved, canonicalName: resolved.canonicalName });
    }
  };

  // Single words (covers C++, C#, .NET, Node.js, React, etc.)
  for (const word of words) record(word);

  // Multi-word n-grams (covers "Machine Learning", "Paid acquisition", etc.)
  for (let n = 2; n <= MAX_CONCEPT_WORDS; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const windowWords = words.slice(i, i + n);
      if (windowWords.some((w) => /[+#.]$/.test(w))) continue;
      record(windowWords.join(" "));
    }
  }

  return [...found.values()];
}

/**
 * Resolves a free-text fragment to the first known skill concept, or null if
 * none of its tokens belong to the taxonomy.
 */
export function matchSkillConceptInText(
  text: string,
  recruiterAliases?: string[],
): SkillResolutionResult | null {
  return matchSkillConceptsInText(text, recruiterAliases)[0] ?? null;
}
