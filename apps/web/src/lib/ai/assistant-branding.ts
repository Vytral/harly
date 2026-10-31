import "server-only";

import { eq } from "drizzle-orm";

import { db, organization } from "@harly/db";

import {
  readAssistantBranding,
  toClientAssistantBranding,
  type AssistantBranding,
  type ClientAssistantBranding,
} from "./assistant-branding-shared";

/**
 * The workspace's assistant branding (name, avatar, "Powered by" flag), with
 * safe defaults. Call this from the chat route to tell the model its name:
 * `const { assistantName } = await getAssistantBranding(workspaceId)`.
 */
export async function getAssistantBranding(
  workspaceId: string,
): Promise<AssistantBranding> {
  const [row] = await db
    .select({ metadata: organization.metadata })
    .from(organization)
    .where(eq(organization.id, workspaceId))
    .limit(1);
  return readAssistantBranding(row?.metadata);
}

export async function getClientAssistantBranding(
  workspaceId: string,
): Promise<ClientAssistantBranding> {
  return toClientAssistantBranding(await getAssistantBranding(workspaceId));
}
