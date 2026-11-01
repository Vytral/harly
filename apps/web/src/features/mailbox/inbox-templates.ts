import { interpolateTemplate, type TemplateValues } from "@/features/email-templates/interpolate";
import type { ComposerTemplate } from "@/features/mailbox/MailComposer";

/** The slice of a stored template the inbox needs. */
export type InboxTemplateSource = { id: string; name: string; type: string; subject: string; body: string };

/**
 * Types that make sense as a free-form reply. Offer, rejection and interview
 * invites are sent from their own flows with the data they need.
 */
const REPLY_TEMPLATE_TYPES = new Set(["general", "screening", "stage_change"]);

const VARIABLE = /\{\{\s*([a-zA-Z0-9_.\-]+)\s*\}\}/g;

function canonical(key: string) {
  return key.toLowerCase().replace(/[-.]/g, "_");
}

/**
 * Templates for a reply, filled in for this conversation. A template is left
 * out when it references a variable the inbox cannot fill (an interview time,
 * a booking link), so a recruiter never sends a blank where a value belongs.
 */
export function buildInboxTemplates(templates: InboxTemplateSource[], values: TemplateValues): ComposerTemplate[] {
  const available = new Set(Object.entries(values).filter(([, value]) => Boolean(value)).map(([key]) => key));
  const fillable = (text: string) => [...text.matchAll(VARIABLE)].every((match) => available.has(canonical(match[1])));
  return templates
    .filter((template) => REPLY_TEMPLATE_TYPES.has(template.type) && fillable(template.subject) && fillable(template.body))
    .map((template) => ({
      id: template.id,
      name: template.name,
      subject: interpolateTemplate(template.subject, values),
      body: interpolateTemplate(template.body, values),
    }));
}
