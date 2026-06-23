import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull, lt } from "drizzle-orm";

import {
  candidatePortalMagicLinks,
  candidatePortalSessions,
  candidates,
  db,
  organization,
  workspaceSettings,
} from "@harly/db";
import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

export type PortalSession = {
  candidateId: string;
  workspaceId: string;
  firstName: string;
  lastName: string;
  email: string;
};

export type PortalOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

export const PORTAL_SESSION_COOKIE = "harly_portal_session";
const SESSION_TTL_DAYS = 30;
const MAGIC_LINK_TTL_MINUTES = 15;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function getPortalWorkspaceId(): Promise<string | null> {
  const [row] = await db.select({ id: organization.id }).from(organization).limit(1);
  return row?.id ?? null;
}

export async function isPortalEnabled(): Promise<boolean> {
  const workspaceId = await getPortalWorkspaceId();
  if (!workspaceId) return false;
  const [row] = await db
    .select({ enabled: workspaceSettings.candidatePortalEnabled })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  return Boolean(row?.enabled);
}

export async function getPortalGoogleCredentials(): Promise<PortalOAuthCredentials | null> {
  const workspaceId = await getPortalWorkspaceId();
  if (workspaceId && isEncryptionConfigured()) {
    const [row] = await db
      .select({
        clientId: workspaceSettings.portalGoogleClientId,
        ciphertext: workspaceSettings.portalGoogleClientSecretCiphertext,
        iv: workspaceSettings.portalGoogleClientSecretIv,
        tag: workspaceSettings.portalGoogleClientSecretTag,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1);
    if (row?.clientId && row.ciphertext && row.iv && row.tag) {
      try {
        const clientSecret = decryptSecret({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag });
        return { clientId: row.clientId, clientSecret };
      } catch { /* fall through */ }
    }
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

export async function getPortalGitHubCredentials(): Promise<PortalOAuthCredentials | null> {
  const workspaceId = await getPortalWorkspaceId();
  if (workspaceId && isEncryptionConfigured()) {
    const [row] = await db
      .select({
        clientId: workspaceSettings.portalGithubClientId,
        ciphertext: workspaceSettings.portalGithubClientSecretCiphertext,
        iv: workspaceSettings.portalGithubClientSecretIv,
        tag: workspaceSettings.portalGithubClientSecretTag,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1);
    if (row?.clientId && row.ciphertext && row.iv && row.tag) {
      try {
        const clientSecret = decryptSecret({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag });
        return { clientId: row.clientId, clientSecret };
      } catch { /* fall through */ }
    }
  }
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

export async function createPortalSession(candidateId: string, workspaceId: string, userAgent?: string): Promise<string> {
  const raw = generateToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.delete(candidatePortalSessions).where(
    and(eq(candidatePortalSessions.candidateId, candidateId), lt(candidatePortalSessions.expiresAt, new Date())),
  );
  await db.insert(candidatePortalSessions).values({ candidateId, workspaceId, tokenHash, userAgent: userAgent ?? null, expiresAt });
  return raw;
}

export async function resolvePortalSession(rawToken: string): Promise<PortalSession | null> {
  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select({
      candidateId: candidatePortalSessions.candidateId,
      workspaceId: candidatePortalSessions.workspaceId,
      expiresAt: candidatePortalSessions.expiresAt,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
    })
    .from(candidatePortalSessions)
    .innerJoin(candidates, eq(candidates.id, candidatePortalSessions.candidateId))
    .where(and(eq(candidatePortalSessions.tokenHash, tokenHash), gt(candidatePortalSessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  return { candidateId: row.candidateId, workspaceId: row.workspaceId, firstName: row.firstName, lastName: row.lastName, email: row.email };
}

export async function deletePortalSession(rawToken: string): Promise<void> {
  await db.delete(candidatePortalSessions).where(eq(candidatePortalSessions.tokenHash, hashToken(rawToken)));
}

export async function findOrCreateCandidateByEmail(workspaceId: string, email: string, name?: { firstName: string; lastName: string }, avatarUrl?: string): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();
  const [existing] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(and(eq(candidates.workspaceId, workspaceId), eq(candidates.email, normalizedEmail)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(candidates)
    .values({ workspaceId, email: normalizedEmail, firstName: name?.firstName ?? email.split("@")[0] ?? "Candidate", lastName: name?.lastName ?? "", avatarUrl: avatarUrl ?? null })
    .returning({ id: candidates.id });
  if (!created) throw new Error("Failed to create candidate.");
  return created.id;
}

export async function createMagicLinkToken(workspaceId: string, email: string): Promise<string> {
  const raw = generateToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60_000);
  await db.delete(candidatePortalMagicLinks).where(
    and(eq(candidatePortalMagicLinks.email, email.toLowerCase()), eq(candidatePortalMagicLinks.workspaceId, workspaceId), isNull(candidatePortalMagicLinks.usedAt)),
  );
  await db.insert(candidatePortalMagicLinks).values({ email: email.toLowerCase().trim(), workspaceId, tokenHash, expiresAt });
  return raw;
}

export async function consumeMagicLinkToken(rawToken: string): Promise<{ email: string; workspaceId: string } | null> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const [row] = await db
    .select({ id: candidatePortalMagicLinks.id, email: candidatePortalMagicLinks.email, workspaceId: candidatePortalMagicLinks.workspaceId, expiresAt: candidatePortalMagicLinks.expiresAt, usedAt: candidatePortalMagicLinks.usedAt })
    .from(candidatePortalMagicLinks)
    .where(eq(candidatePortalMagicLinks.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt < now) return null;
  await db.update(candidatePortalMagicLinks).set({ usedAt: now }).where(eq(candidatePortalMagicLinks.id, row.id));
  return { email: row.email, workspaceId: row.workspaceId };
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<{ email: string; firstName: string; lastName: string; avatarUrl?: string }> {
  const creds = await getPortalGoogleCredentials();
  if (!creds) throw new Error("Google OAuth not configured.");
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: creds.clientId, client_secret: creds.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!tokenRes.ok) throw new Error("Google token exchange failed.");
  const { access_token } = await tokenRes.json() as { access_token: string };
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!userRes.ok) throw new Error("Google userinfo fetch failed.");
  const user = await userRes.json() as { email: string; given_name?: string; family_name?: string; picture?: string };
  return { email: user.email, firstName: user.given_name ?? user.email.split("@")[0] ?? "Candidate", lastName: user.family_name ?? "", avatarUrl: user.picture };
}

export async function exchangeGitHubCode(code: string): Promise<{ email: string; firstName: string; lastName: string; avatarUrl?: string }> {
  const creds = await getPortalGitHubCredentials();
  if (!creds) throw new Error("GitHub OAuth not configured.");
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ code, client_id: creds.clientId, client_secret: creds.clientSecret }),
  });
  if (!tokenRes.ok) throw new Error("GitHub token exchange failed.");
  const { access_token } = await tokenRes.json() as { access_token: string };
  const [userRes, emailsRes] = await Promise.all([
    fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/vnd.github+json" } }),
    fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/vnd.github+json" } }),
  ]);
  if (!userRes.ok) throw new Error("GitHub user fetch failed.");
  const ghUser = await userRes.json() as { name?: string; avatar_url?: string; login: string };
  const emails = emailsRes.ok ? (await emailsRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>) : [];
  const primaryEmail = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email;
  if (!primaryEmail) throw new Error("No verified email on GitHub account.");
  const nameParts = (ghUser.name ?? ghUser.login).split(" ");
  return { email: primaryEmail, firstName: nameParts[0] ?? ghUser.login, lastName: nameParts.slice(1).join(" ") ?? "", avatarUrl: ghUser.avatar_url };
}

export async function buildGoogleAuthUrl(redirectUri: string, state: string): Promise<string> {
  const creds = await getPortalGoogleCredentials();
  if (!creds) throw new Error("Google OAuth not configured.");
  const params = new URLSearchParams({ client_id: creds.clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, access_type: "online", prompt: "select_account" });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function buildGitHubAuthUrl(state: string): Promise<string> {
  const creds = await getPortalGitHubCredentials();
  if (!creds) throw new Error("GitHub OAuth not configured.");
  const params = new URLSearchParams({ client_id: creds.clientId, scope: "user:email", state });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}
