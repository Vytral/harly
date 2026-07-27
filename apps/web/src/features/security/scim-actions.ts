"use server";

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, scimTokens } from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createScimTokenValue } from "@/server/scim/service";
import { logAuditEvent } from "@/lib/audit-log";

export type ScimTokenSummary = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export async function listScimTokensAction(): Promise<ScimTokenSummary[]> {
  const context = await requirePermission("security:manage");
  return db
    .select({
      id: scimTokens.id,
      name: scimTokens.name,
      tokenPrefix: scimTokens.tokenPrefix,
      lastUsedAt: scimTokens.lastUsedAt,
      expiresAt: scimTokens.expiresAt,
      revokedAt: scimTokens.revokedAt,
      createdAt: scimTokens.createdAt,
    })
    .from(scimTokens)
    .where(eq(scimTokens.workspaceId, context.organization.id))
    .orderBy(scimTokens.createdAt);
}

export async function createScimTokenAction(input: {
  name: string;
  expiresAt?: string;
}): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const context = await requirePermission("security:manage");
    if (context.roleKey !== "owner") return { ok: false, error: "Only owners can manage SCIM tokens." };
    const name = input.name.trim().slice(0, 100);
    if (!name) return { ok: false, error: "Token name is required." };
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
      return { ok: false, error: "Expiration must be a future date." };
    }
    const value = createScimTokenValue();
    const id = crypto.randomUUID();
    await db.insert(scimTokens).values({
      id,
      workspaceId: context.organization.id,
      name,
      tokenPrefix: value.prefix,
      tokenHash: value.hash,
      createdBy: context.user.id,
      expiresAt,
    });
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "scim.token_created",
      resourceType: "scim_token",
      resourceId: id,
      severity: "warning",
      metadata: { name, expiresAt: expiresAt?.toISOString() ?? null },
    });
    return { ok: true, token: value.raw };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to create token." };
  }
}

export async function revokeScimTokenAction(id: string) {
  try {
    const context = await requirePermission("security:manage");
    if (context.roleKey !== "owner") return { ok: false, error: "Only owners can manage SCIM tokens." };
    await db.update(scimTokens).set({ revokedAt: new Date() }).where(
      and(eq(scimTokens.id, id), eq(scimTokens.workspaceId, context.organization.id)),
    );
    await logAuditEvent({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      actorEmail: context.user.email,
      action: "scim.token_revoked",
      resourceType: "scim_token",
      resourceId: id,
      severity: "critical",
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to revoke token." };
  }
}
