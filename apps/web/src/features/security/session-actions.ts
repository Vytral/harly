"use server";

import { headers } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, member, session } from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { logAuditEvent } from "@/lib/audit-log";

export type SessionDevice = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  current: boolean;
};

async function currentSession() {
  const value = await auth.api.getSession({ headers: await headers() });
  if (!value) throw new Error("Unauthorized");
  return value;
}

export async function listMySessionsAction(): Promise<SessionDevice[]> {
  const current = await currentSession();
  const rows = await db.select({
    id: session.id,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
  }).from(session).where(eq(session.userId, current.user.id)).orderBy(session.updatedAt);
  return rows.map((row) => ({ ...row, current: row.id === current.session.id }));
}

export async function revokeMySessionAction(sessionId: string) {
  const current = await currentSession();
  const target = await db.select({ id: session.id }).from(session).where(and(eq(session.id, sessionId), eq(session.userId, current.user.id))).limit(1);
  if (!target[0]) return { ok: false, error: "Session not found." };
  await db.delete(session).where(eq(session.id, sessionId));
  const { organization } = await getWorkspaceContext();
  await logAuditEvent({ workspaceId: organization.id, actorId: current.user.id, actorEmail: current.user.email, action: "session.revoked", resourceType: "session", resourceId: sessionId, severity: "warning" });
  return { ok: true, current: sessionId === current.session.id };
}

export async function revokeMemberSessionAction(memberId: string, sessionId: string) {
  const context = await requirePermission("security:manage");
  const [targetMember] = await db.select({ userId: member.userId }).from(member).where(and(eq(member.id, memberId), eq(member.organizationId, context.organization.id))).limit(1);
  if (!targetMember) return { ok: false, error: "Member not found." };
  const [target] = await db.select({ id: session.id }).from(session).where(and(eq(session.id, sessionId), eq(session.userId, targetMember.userId))).limit(1);
  if (!target) return { ok: false, error: "Session not found." };
  await db.delete(session).where(eq(session.id, sessionId));
  await logAuditEvent({ workspaceId: context.organization.id, actorId: context.user.id, actorEmail: context.user.email, action: "member.session_revoked", resourceType: "session", resourceId: sessionId, severity: "warning", metadata: { memberId } });
  return { ok: true };
}

export async function listMemberSessionsAction(memberId: string): Promise<SessionDevice[]> {
  const context = await requirePermission("security:manage");
  const [targetMember] = await db.select({ userId: member.userId }).from(member).where(and(eq(member.id, memberId), eq(member.organizationId, context.organization.id))).limit(1);
  if (!targetMember) return [];
  const rows = await db.select({ id: session.id, ipAddress: session.ipAddress, userAgent: session.userAgent, createdAt: session.createdAt, updatedAt: session.updatedAt, expiresAt: session.expiresAt }).from(session).where(eq(session.userId, targetMember.userId)).orderBy(session.updatedAt);
  return rows.map((row) => ({ ...row, current: false }));
}

export async function revokeOtherMySessionsAction() {
  const current = await currentSession();
  await db.delete(session).where(and(eq(session.userId, current.user.id), ne(session.id, current.session.id)));
  const { organization } = await getWorkspaceContext();
  await logAuditEvent({ workspaceId: organization.id, actorId: current.user.id, actorEmail: current.user.email, action: "session.other_sessions_revoked", severity: "warning" });
  return { ok: true };
}
