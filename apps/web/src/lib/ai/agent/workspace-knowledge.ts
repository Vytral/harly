import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { normalizeCareerPageConfig } from "@/features/career-page/config";

export type WorkspaceKnowledgeInput = {
  workspaceName: string;
  tagline?: string | null;
  description?: string | null;
  careerPageConfig?: unknown;
};

function clip(value: string | null | undefined, max: number): string | null {
  if (!value?.trim()) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

/** Build compact, factual context from existing workspace branding settings. */
export function buildWorkspaceKnowledge(input: WorkspaceKnowledgeInput): string | null {
  const career = normalizeCareerPageConfig(input.careerPageConfig);
  const lines = [
    `Company: ${clip(input.workspaceName, 120)}`,
    clip(input.tagline, 240) ? `Tagline: ${clip(input.tagline, 240)}` : null,
    clip(input.description, 900) ? `Description: ${clip(input.description, 900)}` : null,
    clip(career.hero.headline, 240) ? `Careers headline: ${clip(career.hero.headline, 240)}` : null,
    clip(career.hero.subhead, 500) ? `Careers subhead: ${clip(career.hero.subhead, 500)}` : null,
    clip(career.intro.body, 900) ? `How the company describes itself: ${clip(career.intro.body, 900)}` : null,
    career.values.enabled && career.values.items.length
      ? `Values:\n${career.values.items
          .slice(0, 8)
          .map((value) => `- ${clip(value.title, 120) ?? "Value"}: ${clip(value.body, 300) ?? ""}`)
          .join("\n")}`
      : null,
  ].filter((line): line is string => Boolean(line));

  return lines.length > 1 ? lines.join("\n") : null;
}

export async function getWorkspaceKnowledge(
  workspaceId: string,
  workspaceName: string,
): Promise<string | null> {
  try {
    const [settings] = await db
      .select({
        tagline: workspaceSettings.tagline,
        description: workspaceSettings.description,
        careerPageConfig: workspaceSettings.careerPageConfig,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1);

    return buildWorkspaceKnowledge({
      workspaceName,
      tagline: settings?.tagline,
      description: settings?.description,
      careerPageConfig: settings?.careerPageConfig,
    });
  } catch {
    // Brand context is an enhancement; a settings/read failure must never take
    // down the core chat agent.
    return null;
  }
}
