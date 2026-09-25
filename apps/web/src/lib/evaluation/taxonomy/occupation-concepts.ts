/**
 * Occupation / Title Normalization — Phase 3 (Audit doc §24 Phase 3, §8 analog).
 *
 * Normalizes raw job titles to canonical occupation concepts with:
 * - stable Harly IDs (optional external O*NET-SOC / ESCO mapping hooks)
 * - seniority extraction (intern → principal) kept SEPARATE from the role family
 * - related-but-not-equivalent separation (e.g. "Product Manager" ≠ "Project Manager")
 *
 * Hard rules:
 * - Ambiguous titles stay unresolved/low-confidence — never guessed (exit gate).
 * - NO career-velocity bonus anywhere (exit gate / §16.4). Seniority is a
 *   neutral fact, never a quality signal.
 */

export type SeniorityLevel =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "principal"
  | "manager"
  | "director"
  | "executive"
  | "unknown";

export interface OccupationConcept {
  id: string; // stable Harly ID, e.g. "occ:software-engineer"
  canonicalName: string;
  aliases: string[];
  /** Broader occupation family for relevance grouping (never equivalence). */
  family: string;
  /** Related occupations that must NOT be treated as the same role. */
  relatedOccupations?: string[];
  externalIds?: { onetSoc?: string; escoUri?: string };
}

export interface TitleNormalizationResult {
  rawTitle: string;
  occupationId?: string;
  canonicalName?: string;
  seniority: SeniorityLevel;
  method: "exact" | "alias" | "family" | "unresolved";
  confidence: number; // 0-1
}

const SENIORITY_PATTERNS: Array<{ level: SeniorityLevel; pattern: RegExp }> = [
  { level: "executive", pattern: /\b(cto|ceo|cfo|coo|vp|vice\s+president|head\s+of|chief)\b/i },
  { level: "director", pattern: /\b(director|director[a]?)\b/i },
  { level: "manager", pattern: /\b(manager|gerente|supervisor|team\s+lead|coordinador[a]?)\b/i },
  { level: "principal", pattern: /\b(principal|distinguished|fellow)\b/i },
  { level: "lead", pattern: /\b(lead|staff|l[ií]der|lider)\b/i },
  { level: "senior", pattern: /\b(senior|sr\.?|sr\b|s[eé]nior)\b/i },
  { level: "mid", pattern: /\b(mid|intermediate|semi[-\s]?senior|pleno)\b/i },
  { level: "junior", pattern: /\b(junior|jr\.?|jr\b|entry[-\s]?level|associate)\b/i },
  { level: "intern", pattern: /\b(intern|trainee|pasante|becario|practicante)\b/i },
];

/** Extract seniority signal from a raw title. Neutral fact, never a score. */
export function extractSeniority(rawTitle: string): SeniorityLevel {
  for (const { level, pattern } of SENIORITY_PATTERNS) {
    if (pattern.test(rawTitle)) return level;
  }
  return "unknown";
}

/**
 * Built-in occupation taxonomy (seed). Kept intentionally small and governed;
 * designed to be extended by versioned O*NET/ESCO imports, never a giant
 * hand-maintained synonym pile (§23.4).
 */
export const BUILT_IN_OCCUPATIONS: OccupationConcept[] = [
  // Engineering family
  { id: "occ:backend-engineer", canonicalName: "Backend Engineer", family: "software-engineering", aliases: ["Backend Developer", "Backend Software Engineer", "Server-Side Engineer", "Desarrollador Backend", "Backend Dev"], relatedOccupations: ["occ:fullstack-engineer", "occ:devops-engineer"], externalIds: { onetSoc: "15-1252.00" } },
  { id: "occ:frontend-engineer", canonicalName: "Frontend Engineer", family: "software-engineering", aliases: ["Frontend Developer", "Front-End Engineer", "Front End Developer", "Desarrollador Frontend", "UI Engineer", "Web Developer"], relatedOccupations: ["occ:fullstack-engineer"], externalIds: { onetSoc: "15-1252.00" } },
  { id: "occ:fullstack-engineer", canonicalName: "Full Stack Engineer", family: "software-engineering", aliases: ["Fullstack Developer", "Full-Stack Developer", "Full Stack Developer", "Desarrollador Full Stack"], relatedOccupations: ["occ:backend-engineer", "occ:frontend-engineer"] },
  { id: "occ:mobile-engineer", canonicalName: "Mobile Engineer", family: "software-engineering", aliases: ["Mobile Developer", "iOS Engineer", "Android Engineer", "iOS Developer", "Android Developer", "Desarrollador Móvil"] },
  { id: "occ:devops-engineer", canonicalName: "DevOps Engineer", family: "platform", aliases: ["Site Reliability Engineer", "SRE", "Platform Engineer", "Infrastructure Engineer", "Cloud Engineer", "Ingeniero DevOps"], relatedOccupations: ["occ:backend-engineer"] },
  { id: "occ:data-engineer", canonicalName: "Data Engineer", family: "data", aliases: ["Data Platform Engineer", "ETL Engineer", "Ingeniero de Datos"], relatedOccupations: ["occ:data-scientist", "occ:data-analyst"] },
  { id: "occ:data-scientist", canonicalName: "Data Scientist", family: "data", aliases: ["ML Engineer", "Machine Learning Engineer", "Científico de Datos", "AI Engineer"], relatedOccupations: ["occ:data-engineer", "occ:data-analyst"] },
  { id: "occ:data-analyst", canonicalName: "Data Analyst", family: "data", aliases: ["Business Analyst", "BI Analyst", "Analista de Datos"], relatedOccupations: ["occ:data-scientist"] },
  { id: "occ:qa-engineer", canonicalName: "QA Engineer", family: "software-engineering", aliases: ["Quality Assurance Engineer", "QA Analyst", "Test Engineer", "SDET", "Analista QA"], relatedOccupations: [] },
  { id: "occ:security-engineer", canonicalName: "Security Engineer", family: "platform", aliases: ["Security Analyst", "AppSec Engineer", "Cybersecurity Engineer", "Ingeniero de Seguridad"] },
  // Product / Design family
  { id: "occ:product-manager", canonicalName: "Product Manager", family: "product", aliases: ["PM", "Product Owner", "Gerente de Producto"], relatedOccupations: ["occ:project-manager"] },
  { id: "occ:project-manager", canonicalName: "Project Manager", family: "product", aliases: ["Program Manager", "Gerente de Proyecto"], relatedOccupations: ["occ:product-manager"] },
  { id: "occ:designer", canonicalName: "Product Designer", family: "design", aliases: ["UX Designer", "UI Designer", "UI/UX Designer", "UX/UI Designer", "Diseñador UX"], relatedOccupations: [] },
  // GTM family
  { id: "occ:marketing", canonicalName: "Marketing Manager", family: "marketing", aliases: ["Growth Marketing Manager", "Marketing Specialist", "Growth Marketer", "Digital Marketing Manager", "Gerente de Marketing"], relatedOccupations: ["occ:sales"] },
  { id: "occ:sales", canonicalName: "Account Executive", family: "sales", aliases: ["Sales Representative", "Sales Executive", "AE", "Ejecutivo de Ventas"], relatedOccupations: ["occ:marketing"] },
  { id: "occ:customer-support", canonicalName: "Customer Support", family: "support", aliases: ["Customer Success", "Support Engineer", "Customer Service Representative", "Soporte al Cliente"], relatedOccupations: [] },
  // Other
  { id: "occ:finance", canonicalName: "Accountant", family: "finance", aliases: ["Financial Analyst", "Contador", "Controller"], relatedOccupations: [] },
  { id: "occ:operations", canonicalName: "Operations Manager", family: "operations", aliases: ["Operations Coordinator", "Operations Analyst", "Gerente de Operaciones"], relatedOccupations: [] },
];

function normalizeKey(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const CANONICAL_MAP = new Map<string, OccupationConcept>();
const ALIAS_MAP = new Map<string, OccupationConcept>();
for (const occ of BUILT_IN_OCCUPATIONS) {
  CANONICAL_MAP.set(normalizeKey(occ.canonicalName), occ);
  for (const a of occ.aliases) ALIAS_MAP.set(normalizeKey(a), occ);
}

/**
 * Normalizes a raw job title to an occupation concept + seniority.
 *
 * Precedence: exact canonical → alias → token-overlap within family (low
 * confidence) → unresolved. Ambiguous titles stay unresolved rather than
 * being guessed (Phase 3 exit gate).
 */
export function normalizeJobTitle(rawTitle: string): TitleNormalizationResult {
  const seniority = extractSeniority(rawTitle);
  const key = normalizeKey(rawTitle);

  const exact = CANONICAL_MAP.get(key);
  if (exact) {
    return { rawTitle, occupationId: exact.id, canonicalName: exact.canonicalName, seniority, method: "exact", confidence: 0.98 };
  }
  const alias = ALIAS_MAP.get(key);
  if (alias) {
    return { rawTitle, occupationId: alias.id, canonicalName: alias.canonicalName, seniority, method: "alias", confidence: 0.93 };
  }

  // Token-overlap: strip seniority words, then require ALL remaining core tokens
  // to appear in a known concept's canonical/alias. Conservative to avoid false equivalence.
  const core = key
    .split(" ")
    .filter((t) => t && !SENIORITY_PATTERNS.some((p) => p.pattern.test(t)));
  if (core.length > 0) {
    let best: OccupationConcept | null = null;
    let bestScore = 0;
    for (const occ of BUILT_IN_OCCUPATIONS) {
      const names = [occ.canonicalName, ...occ.aliases].map(normalizeKey);
      for (const name of names) {
        const nameTokens = name.split(" ");
        const overlap = core.filter((t) => nameTokens.includes(t)).length;
        const score = overlap / Math.max(core.length, nameTokens.length);
        if (overlap > 0 && score > bestScore) {
          bestScore = score;
          best = occ;
        }
      }
    }
    // Require strong overlap (>=0.6) to call it a family match; else unresolved.
    if (best && bestScore >= 0.6) {
      return { rawTitle, occupationId: best.id, canonicalName: best.canonicalName, seniority, method: "family", confidence: Math.min(0.8, 0.5 + bestScore * 0.3) };
    }
  }

  return { rawTitle, seniority, method: "unresolved", confidence: 0 };
}

/**
 * True when two normalized titles are in the same occupation FAMILY but are
 * DIFFERENT concepts — relevant for a soft relevance signal, never equivalence.
 */
export function isSameOccupationFamily(a?: string, b?: string): boolean {
  if (!a || !b || a === b) return false;
  const oa = BUILT_IN_OCCUPATIONS.find((o) => o.id === a);
  const ob = BUILT_IN_OCCUPATIONS.find((o) => o.id === b);
  return Boolean(oa && ob && oa.family === ob.family);
}

/** True when `candidateOcc` is explicitly related-but-not-equivalent to `targetOcc`. */
export function isRelatedOccupationNotEquivalent(targetOccId: string, candidateOccId: string): boolean {
  const target = BUILT_IN_OCCUPATIONS.find((o) => o.id === targetOccId);
  if (!target?.relatedOccupations) return false;
  return target.relatedOccupations.includes(candidateOccId);
}
