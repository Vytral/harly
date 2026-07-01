/**
 * Template variable interpolation — pure and dependency-free so it is unit
 * testable and safe to use on both server and client (live preview).
 *
 * Variables use `{{variable_name}}` syntax. Only whitelisted variables are
 * replaced; unknown ones are left literally in place so typos are visible
 * rather than silently swallowed.
 *
 * Regex supports: letters (a-z, A-Z), digits (0-9), underscores (_),
 * hyphens (-), and dots (.).
 */

export const TEMPLATE_VARIABLES = [
  // Candidate
  { key: "candidate_first_name", label: "Candidate first name", group: "Candidate" },
  { key: "candidate_last_name", label: "Candidate last name", group: "Candidate" },
  { key: "candidate_full_name", label: "Candidate full name", group: "Candidate" },
  // Job & stage
  { key: "job_title", label: "Job title", group: "Job" },
  { key: "stage_name", label: "Current stage", group: "Job" },
  // Interview
  { key: "interview_date", label: "Interview date", group: "Interview" },
  { key: "interview_time", label: "Interview time", group: "Interview" },
  { key: "interview_location", label: "Interview location / link", group: "Interview" },
  // Offer
  { key: "offer_salary", label: "Offer salary", group: "Offer" },
  { key: "offer_expiry", label: "Offer expiry date", group: "Offer" },
  // Workspace
  { key: "company_name", label: "Company name", group: "Workspace" },
  { key: "portal_link", label: "Candidate portal link", group: "Workspace" },
  { key: "sender_name", label: "Your name", group: "Workspace" },
] as const;

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLES)[number]["key"];

export type TemplateValues = Partial<Record<TemplateVariableKey, string>>;

const KNOWN_KEYS = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));

// Matches {{ variable-name_with.dots }} — letters, digits, underscores, hyphens, dots
const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.\-]+)\s*\}\}/g;

/** Normalize a variable key to lowercase for case-insensitive matching. */
function normalizeKey(key: string): string {
  return key.toLowerCase();
}

/** Replace `{{variable}}` placeholders with values. Unknown keys stay literal. */
export function interpolateTemplate(
  template: string,
  values: TemplateValues,
): string {
  return template.replace(VARIABLE_REGEX, (match, key: string) => {
    const normalized = normalizeKey(key);
    if (!KNOWN_KEYS.has(normalized)) return match;
    return values[normalized as TemplateVariableKey] ?? "";
  });
}

/** Variables referenced in a template that aren't in the whitelist. */
export function findUnknownVariables(template: string): string[] {
  const unknown = new Set<string>();
  for (const match of template.matchAll(VARIABLE_REGEX)) {
    const normalized = normalizeKey(match[1]);
    if (!KNOWN_KEYS.has(normalized)) unknown.add(match[1]);
  }
  return [...unknown];
}
