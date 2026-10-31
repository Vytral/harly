import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { normalizeCareerPageConfig } from "@/features/career-page/config";

export type WorkspaceKnowledgeInput = {
  workspaceName: string;
  tagline?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  careerPageConfig?: unknown;
};

function clip(value: string | null | undefined, max: number): string | null {
  if (!value?.trim()) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

/**
 * How much workspace memory the chat prompt carries. `full` is the bounded
 * careers/brand context (can reach several thousand characters); `brief` is
 * the identity lines only, for turns that do not write company-voiced copy.
 */
export type WorkspaceKnowledgeDetail = "brief" | "full";

/** Build compact, factual context from existing workspace branding settings. */
export function buildWorkspaceKnowledge(
  input: WorkspaceKnowledgeInput,
  detail: WorkspaceKnowledgeDetail = "full",
): string | null {
  if (detail === "brief") return buildBriefWorkspaceKnowledge(input);
  const career = normalizeCareerPageConfig(input.careerPageConfig);
  const lines = [
    `Company: ${clip(input.workspaceName, 120)}`,
    clip(input.tagline, 240) ? `Tagline: ${clip(input.tagline, 240)}` : null,
    clip(input.description, 900)
      ? `Description: ${clip(input.description, 900)}`
      : null,
    clip(input.websiteUrl, 240)
      ? `Website: ${clip(input.websiteUrl, 240)}`
      : null,
    clip(career.hero.headline, 240)
      ? `Careers headline: ${clip(career.hero.headline, 240)}`
      : null,
    clip(career.hero.subhead, 500)
      ? `Careers subhead: ${clip(career.hero.subhead, 500)}`
      : null,
    clip(career.intro.body, 900)
      ? `How the company describes itself: ${clip(career.intro.body, 900)}`
      : null,
    career.values.enabled && career.values.items.length
      ? `Values:\n${career.values.items
          .slice(0, 8)
          .map(
            (value) =>
              `- ${clip(value.title, 120) ?? "Value"}: ${clip(value.body, 300) ?? ""}`,
          )
          .join("\n")}`
      : null,
    career.overview.enabled && career.overview.stats.length
      ? `Overview:
${career.overview.stats
  .slice(0, 8)
  .map(
    (stat) =>
      `- ${clip(stat.label, 120) ?? "Stat"}: ${clip(stat.value, 180) ?? ""}`,
  )
  .join("\n")}`
      : null,
    career.testimonials.enabled && career.testimonials.items.length
      ? `Public testimonials:
${career.testimonials.items
  .slice(0, 5)
  .map(
    (item) =>
      `- ${clip(item.name, 120) ?? "Person"}${clip(item.role, 120) ? ` (${clip(item.role, 120)})` : ""}: ${clip(item.quote, 400) ?? ""}`,
  )
  .join("\n")}`
      : null,
    career.faq.enabled && career.faq.items.length
      ? `Career-page FAQs:
${career.faq.items
  .slice(0, 10)
  .map(
    (item) =>
      `- ${clip(item.q, 180) ?? "Question"}: ${clip(item.a, 500) ?? ""}`,
  )
  .join("\n")}`
      : null,
    career.cta.enabled
      ? [
          clip(career.cta.title, 240)
            ? `Careers CTA: ${clip(career.cta.title, 240)}`
            : null,
          clip(career.cta.body, 500)
            ? `Careers CTA details: ${clip(career.cta.body, 500)}`
            : null,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n") || null
      : null,
  ].filter((line): line is string => Boolean(line));

  return lines.length > 1 ? lines.join("\n") : null;
}

function buildBriefWorkspaceKnowledge(input: WorkspaceKnowledgeInput): string | null {
  const lines = [
    `Company: ${clip(input.workspaceName, 120)}`,
    clip(input.tagline, 160) ? `Tagline: ${clip(input.tagline, 160)}` : null,
    clip(input.websiteUrl, 160) ? `Website: ${clip(input.websiteUrl, 160)}` : null,
  ].filter((line): line is string => Boolean(line));
  return lines.length > 1 ? lines.join("\n") : null;
}

/**
 * Turns that write company-voiced copy (job drafts, emails, templates) or ask
 * about the company itself get the full careers/brand memory; every other
 * turn gets the identity lines only.
 */
export function workspaceKnowledgeDetailFor(input: {
  message: string;
  activeGroups: ReadonlySet<string>;
}): WorkspaceKnowledgeDetail {
  if (input.activeGroups.has("aiGeneration") || input.activeGroups.has("templates")) {
    return "full";
  }
  return /\b(company|compa[nñ][ií]a|empresa|cultur|values|valores|benefit|beneficio|careers?|about us|nosotros|brand|marca|tone|tono|job description|descripci[oó]n del puesto|redact|draft|borrador|escrib|write)\w*/i.test(
    input.message,
  )
    ? "full"
    : "brief";
}

export async function getWorkspaceKnowledge(
  workspaceId: string,
  workspaceName: string,
  detail: WorkspaceKnowledgeDetail = "full",
): Promise<string | null> {
  try {
    const [settings] = await db
      .select({
        tagline: workspaceSettings.tagline,
        description: workspaceSettings.description,
        websiteUrl: workspaceSettings.websiteUrl,
        careerPageConfig: workspaceSettings.careerPageConfig,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1);

    return buildWorkspaceKnowledge({
      workspaceName,
      tagline: settings?.tagline,
      description: settings?.description,
      websiteUrl: settings?.websiteUrl,
      careerPageConfig: settings?.careerPageConfig,
    }, detail);
  } catch {
    // Brand context is an enhancement; a settings/read failure must never take
    // down the core chat agent.
    return null;
  }
}
