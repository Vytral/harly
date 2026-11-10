/**
 * Template variable interpolation , pure and dependency-free so it is unit
 * testable and safe to use on both server and client (live preview).
 *
 * Variables use `{{variable_name}}` syntax. Only whitelisted variables are
 * replaced; unknown ones are left literally in place so typos are visible
 * rather than silently swallowed.
 *
 * Regex supports: letters (a-z, A-Z), digits (0-9), underscores (_),
 * hyphens (-), and dots (.).
 */

/**
 * Variables a template can use. Labels and group names live in the
 * `labels.emailTemplates` catalog; resolve them with `labelKey` and `group`.
 */
export const TEMPLATE_VARIABLES = [
  { key: "candidate_first_name", labelKey: "candidateFirstName", group: "candidate" },
  { key: "candidate_last_name", labelKey: "candidateLastName", group: "candidate" },
  { key: "candidate_full_name", labelKey: "candidateFullName", group: "candidate" },
  { key: "job_title", labelKey: "jobTitle", group: "job" },
  { key: "stage_name", labelKey: "stageName", group: "job" },
  { key: "interview_date", labelKey: "interviewDate", group: "interview" },
  { key: "interview_time", labelKey: "interviewTime", group: "interview" },
  { key: "interview_location", labelKey: "interviewLocation", group: "interview" },
  { key: "interview_duration", labelKey: "interviewDuration", group: "interview" },
  { key: "interviewer_name", labelKey: "interviewerName", group: "interview" },
  { key: "offer_salary", labelKey: "offerSalary", group: "offer" },
  { key: "offer_expiry", labelKey: "offerExpiry", group: "offer" },
  { key: "offer_start_date", labelKey: "offerStartDate", group: "offer" },
  { key: "offer_url", labelKey: "offerUrl", group: "offer" },
  { key: "company_name", labelKey: "companyName", group: "workspace" },
  { key: "portal_link", labelKey: "portalLink", group: "workspace" },
  { key: "booking_link", labelKey: "bookingLink", group: "workspace" },
  { key: "sender_name", labelKey: "senderName", group: "workspace" },
] as const;

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLES)[number]["key"];

export type TemplateValues = Partial<Record<TemplateVariableKey, string>>;

const KNOWN_KEYS = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));

// Matches {{ variable-name_with.dots }} , letters, digits, underscores, hyphens, dots
const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.\-]+)\s*\}\}/g;

/** Canonicalize a variable key for interpolation: lowercase and treat hyphens
 *  and dots as underscores so `Candidate_First_Name`, `candidate-first-name`,
 *  and `candidate.first.name` all resolve to `candidate_first_name`. */
function canonicalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-.]/g, "_");
}

/** Replace `{{variable}}` placeholders with values. Unknown keys stay literal. */
export function interpolateTemplate(
  template: string,
  values: TemplateValues,
): string {
  return template.replace(VARIABLE_REGEX, (match, key: string) => {
    const canonical = canonicalizeKey(key);
    if (!KNOWN_KEYS.has(canonical)) return match;
    return values[canonical as TemplateVariableKey] ?? "";
  });
}

/** Variables referenced in a template that aren't in the whitelist.
 *
 *  This is stricter than `interpolateTemplate`: it checks the raw key exactly
 *  as written (without case or separator normalization) so authors see a
 *  warning when they deviate from the canonical `snake_case` form, even though
 *  interpolation will still try to forgive common variants at send time.
 */
export function findUnknownVariables(template: string): string[] {
  const unknown = new Set<string>();
  for (const match of template.matchAll(VARIABLE_REGEX)) {
    const key = match[1];
    if (!KNOWN_KEYS.has(key)) unknown.add(key);
  }
  return [...unknown];
}
