/**
 * Template variable interpolation — pure and dependency-free so it is unit
 * testable and safe to use on both server and client (live preview).
 *
 * Variables use `{{snake_case}}` syntax. Only whitelisted variables are
 * replaced; unknown ones are left literally in place so typos are visible
 * rather than silently swallowed.
 */

export const TEMPLATE_VARIABLES = [
  { key: "candidate_first_name", label: "Candidate first name" },
  { key: "candidate_last_name", label: "Candidate last name" },
  { key: "candidate_full_name", label: "Candidate full name" },
  { key: "job_title", label: "Job title" },
  { key: "company_name", label: "Company name" },
  { key: "sender_name", label: "Your name" },
] as const;

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLES)[number]["key"];

export type TemplateValues = Partial<Record<TemplateVariableKey, string>>;

const KNOWN_KEYS = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));

/** Replace `{{variable}}` placeholders with values. Unknown keys stay literal. */
export function interpolateTemplate(
  template: string,
  values: TemplateValues,
): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => {
    if (!KNOWN_KEYS.has(key)) return match;
    return values[key as TemplateVariableKey] ?? "";
  });
}

/** Variables referenced in a template that aren't in the whitelist. */
export function findUnknownVariables(template: string): string[] {
  const unknown = new Set<string>();
  for (const match of template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) {
    if (!KNOWN_KEYS.has(match[1])) unknown.add(match[1]);
  }
  return [...unknown];
}
