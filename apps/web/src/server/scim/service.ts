import "server-only";

import crypto from "node:crypto";
import { and, eq, ilike, sql } from "drizzle-orm";
import {
  db,
  member,
  memberStatusEnum,
  scimTokens,
  session,
  user,
} from "@harly/db";
import { logAuditEvent } from "@/lib/audit-log";

export const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_LIST_SCHEMA =
  "urn:ietf:params:scim:api:messages:2.0:ListResponse";

type MemberStatus = (typeof memberStatusEnum.enumValues)[number];

export type ScimTokenRecord = typeof scimTokens.$inferSelect;
export type ScimUserInput = {
  externalId?: string;
  userName?: string;
  active?: boolean;
  displayName?: string;
  name?: { givenName?: string; familyName?: string; formatted?: string };
  emails?: Array<{ value?: string; primary?: boolean; type?: string }>;
  title?: string;
  department?: string;
  region?: string;
  team?: string;
  manager?: { value?: string };
  roles?: Array<{ value?: string }>;
};

export type ScimUser = {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  displayName: string;
  active: boolean;
  name: { formatted: string; givenName?: string; familyName?: string };
  emails: Array<{ value: string; primary: boolean; type: string }>;
  title?: string;
  department?: string;
  region?: string;
  team?: string;
  manager?: { value: string };
  meta: { resourceType: "User"; created: string; lastModified: string; location: string };
};

export function hashScimToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createScimTokenValue() {
  const raw = `harly_scim_${crypto.randomBytes(32).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, 18), hash: hashScimToken(raw) };
}

export async function resolveScimToken(
  authorization: string | null,
  workspaceId: string,
): Promise<ScimTokenRecord | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const raw = authorization.slice(7).trim();
  if (!raw || raw.length > 200) return null;

  const [token] = await db
    .select()
    .from(scimTokens)
    .where(
      and(
        eq(scimTokens.workspaceId, workspaceId),
        eq(scimTokens.tokenHash, hashScimToken(raw)),
      ),
    )
    .limit(1);

  if (!token || token.revokedAt || (token.expiresAt && token.expiresAt <= new Date())) {
    return null;
  }

  await db
    .update(scimTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(scimTokens.id, token.id));
  return token;
}

function clean(value: string | undefined, max = 200) {
  const result = value?.trim();
  return result ? result.slice(0, max) : undefined;
}

function emailFromInput(input: ScimUserInput) {
  return clean(
    input.emails?.find((email) => email.primary)?.value ??
      input.emails?.[0]?.value ??
      input.userName,
    320,
  )?.toLowerCase();
}

function displayNameFromInput(input: ScimUserInput, fallback: string) {
  return (
    clean(input.displayName) ??
    clean(input.name?.formatted) ??
    ([clean(input.name?.givenName), clean(input.name?.familyName)]
      .filter(Boolean)
      .join(" ") || fallback)
  );
}

function roleFromInput(input: ScimUserInput) {
  const role = input.roles?.find((item) => item.value)?.value?.trim().toLowerCase();
  return role && ["admin", "recruiter", "hiring_manager"].includes(role)
    ? role
    : "recruiter";
}

function statusFromActive(active: boolean | undefined): MemberStatus {
  return active === false ? "inactive" : "active";
}

function toScimUser(row: {
  memberId: string;
  userId: string;
  externalId: string | null;
  memberStatus: MemberStatus;
  department: string | null;
  region: string | null;
  team: string | null;
  managerMemberId: string | null;
  memberCreatedAt: Date;
  memberUpdatedAt: Date;
  name: string;
  email: string;
  jobTitle: string | null;
}, baseUrl: string): ScimUser {
  const nameParts = row.name.trim().split(/\s+/);
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: row.memberId,
    ...(row.externalId ? { externalId: row.externalId } : {}),
    userName: row.email,
    displayName: row.name,
    active: row.memberStatus === "active",
    name: {
      formatted: row.name,
      ...(nameParts[0] ? { givenName: nameParts[0] } : {}),
      ...(nameParts.length > 1 ? { familyName: nameParts.slice(1).join(" ") } : {}),
    },
    emails: [{ value: row.email, primary: true, type: "work" }],
    ...(row.jobTitle ? { title: row.jobTitle } : {}),
    ...(row.department ? { department: row.department } : {}),
    ...(row.region ? { region: row.region } : {}),
    ...(row.team ? { team: row.team } : {}),
    ...(row.managerMemberId ? { manager: { value: row.managerMemberId } } : {}),
    meta: {
      resourceType: "User",
      created: row.memberCreatedAt.toISOString(),
      lastModified: row.memberUpdatedAt.toISOString(),
      location: `${baseUrl}/Users/${row.memberId}`,
    },
  };
}

async function findMember(workspaceId: string, id: string) {
  const [row] = await db
    .select({
      memberId: member.id,
      userId: user.id,
      externalId: member.scimExternalId,
      memberStatus: member.status,
      department: member.department,
      region: member.region,
      team: member.team,
      managerMemberId: member.managerMemberId,
      memberCreatedAt: member.createdAt,
      memberUpdatedAt: member.updatedAt,
      name: user.name,
      email: user.email,
      jobTitle: user.jobTitle,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, workspaceId), eq(member.id, id)))
    .limit(1);
  return row;
}

export async function getScimUser(workspaceId: string, id: string, baseUrl: string) {
  const row = await findMember(workspaceId, id);
  return row ? toScimUser(row, baseUrl) : null;
}

export async function listScimUsers(
  workspaceId: string,
  baseUrl: string,
  startIndex: number,
  count: number,
  filter?: string,
) {
  const safeStart = Math.max(1, startIndex);
  const safeCount = Math.min(100, Math.max(1, count));
  const match = filter?.match(/^userName\s+eq\s+"([^"]+)"$/i)?.[1];
  const where = and(
    eq(member.organizationId, workspaceId),
    match ? ilike(user.email, match) : undefined,
  );
  const rows = await db
    .select({
      memberId: member.id,
      userId: user.id,
      externalId: member.scimExternalId,
      memberStatus: member.status,
      department: member.department,
      region: member.region,
      team: member.team,
      managerMemberId: member.managerMemberId,
      memberCreatedAt: member.createdAt,
      memberUpdatedAt: member.updatedAt,
      name: user.name,
      email: user.email,
      jobTitle: user.jobTitle,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(where)
    .orderBy(user.email)
    .limit(safeCount)
    .offset(safeStart - 1);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(where);
  return {
    schemas: [SCIM_LIST_SCHEMA],
    totalResults: Number(total),
    startIndex: safeStart,
    itemsPerPage: rows.length,
    Resources: rows.map((row) => toScimUser(row, baseUrl)),
  };
}

export async function upsertScimUser(
  workspaceId: string,
  input: ScimUserInput,
  baseUrl: string,
) {
  const email = emailFromInput(input);
  if (!email || !email.includes("@")) throw new Error("SCIM userName/email is required.");
  const externalId = clean(input.externalId, 255);
  const existingRows = await db
    .select({
      memberId: member.id,
      userId: member.userId,
      externalId: member.scimExternalId,
      memberStatus: member.status,
      department: member.department,
      region: member.region,
      team: member.team,
      managerMemberId: member.managerMemberId,
      memberCreatedAt: member.createdAt,
      memberUpdatedAt: member.updatedAt,
      name: user.name,
      email: user.email,
      jobTitle: user.jobTitle,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, workspaceId),
        externalId
          ? eq(member.scimExternalId, externalId)
          : ilike(user.email, email),
      ),
    )
    .limit(1);
  const existing = existingRows[0];
  const name = displayNameFromInput(input, email.split("@")[0] ?? email);
  const active = statusFromActive(input.active);
  const managerId = clean(input.manager?.value);
  const manager = managerId
    ? await findMember(workspaceId, managerId)
    : null;

  const memberId = await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(user).set({
        name,
        email,
        jobTitle: clean(input.title),
        updatedAt: new Date(),
      }).where(eq(user.id, existing.userId));
      await tx.update(member).set({
        scimExternalId: externalId ?? existing.externalId,
        status: active,
        department: clean(input.department),
        region: clean(input.region),
        team: clean(input.team),
        managerMemberId: manager?.memberId ?? null,
        updatedAt: new Date(),
        ...(input.roles ? { role: roleFromInput(input) } : {}),
      }).where(eq(member.id, existing.memberId));
      return existing.memberId;
    }

    const userId = crypto.randomUUID();
    const newMemberId = crypto.randomUUID();
    await tx.insert(user).values({
      id: userId,
      name,
      email,
      emailVerified: true,
      jobTitle: clean(input.title),
    });
    await tx.insert(member).values({
      id: newMemberId,
      organizationId: workspaceId,
      userId,
      role: roleFromInput(input),
      department: clean(input.department),
      region: clean(input.region),
      team: clean(input.team),
      managerMemberId: manager?.memberId ?? null,
      status: active,
      scimExternalId: externalId,
      createdAt: new Date(),
    });
    return newMemberId;
  });

  const row = await findMember(workspaceId, memberId);
  if (!row) throw new Error("Unable to provision SCIM user.");
  await logAuditEvent({
    workspaceId,
    actorEmail: "scim-provisioning",
    action: existing ? "scim.user_updated" : "scim.user_created",
    resourceType: "member",
    resourceId: row.memberId,
    metadata: { active, externalId: externalId ?? null },
  });
  return toScimUser(row, baseUrl);
}

export async function deactivateScimUser(workspaceId: string, id: string, baseUrl: string) {
  const row = await findMember(workspaceId, id);
  if (!row) return null;
  await db.update(member).set({ status: "inactive", updatedAt: new Date() }).where(eq(member.id, id));
  await db.delete(session).where(eq(session.userId, row.userId));
  await logAuditEvent({
    workspaceId,
    actorEmail: "scim-provisioning",
    action: "scim.user_deactivated",
    resourceType: "member",
    resourceId: id,
    severity: "warning",
  });
  const updated = await findMember(workspaceId, id);
  return updated ? toScimUser(updated, baseUrl) : null;
}
