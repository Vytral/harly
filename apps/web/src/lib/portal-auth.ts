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

export type PortalWorkspace = {
  id: string;
  slug: string;
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

/**
 * Resolves an enabled candidate portal from its public workspace slug. This is
 * intentionally the only slug → workspace lookup used by unauthenticated
 * portal entrypoints; never select an arbitrary organization for a candidate.
 */
export async function getPortalWorkspaceBySlug(
  workspaceSlug: string,
): Promise<PortalWorkspace | null> {
  const [row] = await db
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .innerJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id),
    )
    .where(
      and(
        eq(organization.slug, workspaceSlug.trim().toLowerCase()),
        eq(workspaceSettings.candidatePortalEnabled, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Legacy `/portal` URLs remain usable for a single enabled portal. Once more
 * than one portal is enabled, callers must provide a workspace slug instead
 * of silently routing candidates to whichever organization was created first.
 */
export async function getSinglePortalWorkspace(): Promise<PortalWorkspace | null> {
  const rows = await db
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .innerJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id),
    )
    .where(eq(workspaceSettings.candidatePortalEnabled, true))
    .limit(2);
  return rows.length === 1 ? rows[0] : null;
}

export async function isPortalEnabled(workspaceId?: string): Promise<boolean> {
  if (!workspaceId) {
    const [row] = await db
      .select({ id: workspaceSettings.organizationId })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.candidatePortalEnabled, true))
      .limit(1);
    return Boolean(row);
  }
  const [row] = await db
    .select({ enabled: workspaceSettings.candidatePortalEnabled })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  return Boolean(row?.enabled);
}

export async function getPortalGoogleCredentials(workspaceId: string): Promise<PortalOAuthCredentials | null> {
  if (isEncryptionConfigured()) {
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
        const clientSecret = decryptSecret({
          ciphertext: row.ciphertext,
          iv: row.iv,
          tag: row.tag,
        });
        return { clientId: row.clientId, clientSecret };
      } catch {
        /* fall through */
      }
    }
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

export async function getPortalGitHubCredentials(workspaceId: string): Promise<PortalOAuthCredentials | null> {
  if (isEncryptionConfigured()) {
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
        const clientSecret = decryptSecret({
          ciphertext: row.ciphertext,
          iv: row.iv,
          tag: row.tag,
        });
        return { clientId: row.clientId, clientSecret };
      } catch {
        /* fall through */
      }
    }
  }
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

export async function getPortalLinkedInCredentials(workspaceId: string): Promise<PortalOAuthCredentials | null> {
  if (isEncryptionConfigured()) {
    const [row] = await db
      .select({
        clientId: workspaceSettings.portalLinkedinClientId,
        ciphertext: workspaceSettings.portalLinkedinClientSecretCiphertext,
        iv: workspaceSettings.portalLinkedinClientSecretIv,
        tag: workspaceSettings.portalLinkedinClientSecretTag,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1);
    if (row?.clientId && row.ciphertext && row.iv && row.tag) {
      try {
        const clientSecret = decryptSecret({
          ciphertext: row.ciphertext,
          iv: row.iv,
          tag: row.tag,
        });
        return { clientId: row.clientId, clientSecret };
      } catch {
        /* fall through */
      }
    }
  }
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

export async function createPortalSession(
  candidateId: string,
  workspaceId: string,
  userAgent?: string,
): Promise<string> {
  const raw = generateToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db
    .delete(candidatePortalSessions)
    .where(
      and(
        eq(candidatePortalSessions.candidateId, candidateId),
        lt(candidatePortalSessions.expiresAt, new Date()),
      ),
    );
  await db
    .insert(candidatePortalSessions)
    .values({
      candidateId,
      workspaceId,
      tokenHash,
      userAgent: userAgent ?? null,
      expiresAt,
    });
  return raw;
}

export async function resolvePortalSession(
  rawToken: string,
): Promise<PortalSession | null> {
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
    .innerJoin(
      candidates,
      eq(candidates.id, candidatePortalSessions.candidateId),
    )
    .where(
      and(
        eq(candidatePortalSessions.tokenHash, tokenHash),
        gt(candidatePortalSessions.expiresAt, new Date()),
        eq(candidates.workspaceId, candidatePortalSessions.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    candidateId: row.candidateId,
    workspaceId: row.workspaceId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
  };
}

export async function deletePortalSession(rawToken: string): Promise<void> {
  await db
    .delete(candidatePortalSessions)
    .where(eq(candidatePortalSessions.tokenHash, hashToken(rawToken)));
}

export async function findOrCreateCandidateByEmail(
  workspaceId: string,
  email: string,
  name?: { firstName: string; lastName: string },
  avatarUrl?: string,
  extra?: { linkedinUrl?: string; githubUrl?: string },
): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();
  const [existing] = await db
    .select({
      id: candidates.id,
      avatarUrl: candidates.avatarUrl,
      linkedinUrl: candidates.linkedinUrl,
      githubUrl: candidates.githubUrl,
      deletedAt: candidates.deletedAt,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, workspaceId),
        eq(candidates.email, normalizedEmail),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.deletedAt) {
      throw new Error("Candidate portal access is unavailable.");
    }
    // Sync profile data from OAuth provider on each login
    const updates: Record<string, unknown> = {};
    if (avatarUrl && avatarUrl !== existing.avatarUrl)
      updates.avatarUrl = avatarUrl;
    if (extra?.linkedinUrl && extra.linkedinUrl !== existing.linkedinUrl)
      updates.linkedinUrl = extra.linkedinUrl;
    if (extra?.githubUrl && extra.githubUrl !== existing.githubUrl)
      updates.githubUrl = extra.githubUrl;
    if (Object.keys(updates).length > 0) {
      await db
        .update(candidates)
        .set(updates)
        .where(eq(candidates.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await db
    .insert(candidates)
    .values({
      workspaceId,
      email: normalizedEmail,
      firstName: name?.firstName ?? email.split("@")[0] ?? "Candidate",
      lastName: name?.lastName ?? "",
      avatarUrl: avatarUrl ?? null,
      linkedinUrl: extra?.linkedinUrl ?? null,
      githubUrl: extra?.githubUrl ?? null,
    })
    .returning({ id: candidates.id });
  if (!created) throw new Error("Failed to create candidate.");
  return created.id;
}

export async function createMagicLinkToken(
  workspaceId: string,
  email: string,
): Promise<string> {
  const raw = generateToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60_000);
  await db
    .delete(candidatePortalMagicLinks)
    .where(
      and(
        eq(candidatePortalMagicLinks.email, email.toLowerCase()),
        eq(candidatePortalMagicLinks.workspaceId, workspaceId),
        isNull(candidatePortalMagicLinks.usedAt),
      ),
    );
  await db
    .insert(candidatePortalMagicLinks)
    .values({
      email: email.toLowerCase().trim(),
      workspaceId,
      tokenHash,
      expiresAt,
    });
  return raw;
}

export async function consumeMagicLinkToken(
  rawToken: string,
): Promise<{ email: string; workspaceId: string } | null> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const [row] = await db
    .select({
      id: candidatePortalMagicLinks.id,
      email: candidatePortalMagicLinks.email,
      workspaceId: candidatePortalMagicLinks.workspaceId,
      expiresAt: candidatePortalMagicLinks.expiresAt,
      usedAt: candidatePortalMagicLinks.usedAt,
    })
    .from(candidatePortalMagicLinks)
    .where(eq(candidatePortalMagicLinks.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt < now) return null;
  await db
    .update(candidatePortalMagicLinks)
    .set({ usedAt: now })
    .where(eq(candidatePortalMagicLinks.id, row.id));
  return { email: row.email, workspaceId: row.workspaceId };
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
  workspaceId: string,
): Promise<{
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}> {
  const creds = await getPortalGoogleCredentials(workspaceId);
  if (!creds) throw new Error("Google OAuth not configured.");
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error("Google token exchange failed.");
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) throw new Error("Google userinfo fetch failed.");
  const user = (await userRes.json()) as {
    email: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
  };
  return {
    email: user.email,
    firstName: user.given_name ?? user.email.split("@")[0] ?? "Candidate",
    lastName: user.family_name ?? "",
    avatarUrl: user.picture,
  };
}

export async function exchangeGitHubCode(
  code: string,
  redirectUri: string,
  workspaceId: string,
): Promise<{
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  githubUrl?: string;
}> {
  const creds = await getPortalGitHubCredentials(workspaceId);
  if (!creds) throw new Error("GitHub OAuth not configured.");
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) throw new Error("GitHub token exchange failed.");
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const [userRes, emailsRes] = await Promise.all([
    fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/vnd.github+json",
      },
    }),
    fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/vnd.github+json",
      },
    }),
  ]);
  if (!userRes.ok) throw new Error("GitHub user fetch failed.");
  const ghUser = (await userRes.json()) as {
    name?: string;
    avatar_url?: string;
    login: string;
    html_url: string;
  };
  const emails = emailsRes.ok
    ? ((await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>)
    : [];
  const primaryEmail =
    emails.find((e) => e.primary && e.verified)?.email ??
    emails.find((e) => e.verified)?.email;
  if (!primaryEmail) throw new Error("No verified email on GitHub account.");
  const nameParts = (ghUser.name ?? ghUser.login).split(" ");
  return {
    email: primaryEmail,
    firstName: nameParts[0] ?? ghUser.login,
    lastName: nameParts.slice(1).join(" ") ?? "",
    avatarUrl: ghUser.avatar_url,
    githubUrl: ghUser.html_url,
  };
}

export async function buildGoogleAuthUrl(
  redirectUri: string,
  state: string,
  workspaceId: string,
): Promise<string> {
  const creds = await getPortalGoogleCredentials(workspaceId);
  if (!creds) throw new Error("Google OAuth not configured.");
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function buildGitHubAuthUrl(
  redirectUri: string,
  state: string,
  workspaceId: string,
): Promise<string> {
  const creds = await getPortalGitHubCredentials(workspaceId);
  if (!creds) throw new Error("GitHub OAuth not configured.");
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    scope: "user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeLinkedInCode(
  code: string,
  redirectUri: string,
  workspaceId: string,
): Promise<{
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  headline?: string;
  linkedinUrl?: string;
}> {
  const creds = await getPortalLinkedInCredentials(workspaceId);
  if (!creds) throw new Error("LinkedIn OAuth not configured.");

  // Exchange code for access token
  const tokenRes = await fetch(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    },
  );
  if (!tokenRes.ok) throw new Error("LinkedIn token exchange failed.");
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Fetch user info from LinkedIn OpenID Connect (always works with openid scope)
  const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) throw new Error("LinkedIn userinfo fetch failed.");
  const user = (await userRes.json()) as {
    sub: string;
    email: string;
    name: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
  };

  const result: {
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    headline?: string;
    linkedinUrl?: string;
  } = {
    email: user.email,
    firstName:
      user.given_name ??
      user.name?.split(" ")[0] ??
      user.email.split("@")[0] ??
      "Candidate",
    lastName:
      user.family_name ?? user.name?.split(" ").slice(1).join(" ") ?? "",
    avatarUrl: user.picture,
  };

  // Try to fetch additional profile data from the Profile API
  // This requires r_basicprofile or r_liteprofile scope (may not be available for all apps)
  try {
    const profileRes = await fetch(
      "https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,headline,vanityName,profilePicture~(displayImage~:playableStreams))",
      { headers: { Authorization: `Bearer ${access_token}` } },
    );

    if (profileRes.ok) {
      const profile = (await profileRes.json()) as {
        id?: string;
        firstName?: {
          localized?: Record<string, string>;
          preferredLocale?: { country: string; language: string };
        };
        lastName?: {
          localized?: Record<string, string>;
          preferredLocale?: { country: string; language: string };
        };
        headline?: {
          localized?: Record<string, string>;
          preferredLocale?: { country: string; language: string };
        };
        vanityName?: string;
        profilePicture?: {
          displayImage?: string;
          "displayImage~"?: {
            elements?: Array<{
              identification: string;
              medialets: string;
            }>;
          };
        };
      };

      // Extract headline
      if (profile.headline?.localized) {
        const locale = profile.headline.preferredLocale;
        const localeKey = locale
          ? `${locale.language}_${locale.country}`
          : undefined;
        result.headline = localeKey
          ? profile.headline.localized[localeKey]
          : Object.values(profile.headline.localized)[0];
      }

      // Extract LinkedIn URL from vanityName
      if (profile.vanityName) {
        result.linkedinUrl = `https://www.linkedin.com/in/${profile.vanityName}`;
      }

      // Extract higher resolution profile picture if available
      if (profile.profilePicture?.["displayImage~"]?.elements?.length) {
        const largestImage = profile.profilePicture[
          "displayImage~"
        ].elements.sort((a, b) => {
          const sizeA = parseInt(a.medialets || "0", 10);
          const sizeB = parseInt(b.medialets || "0", 10);
          return sizeB - sizeA;
        })[0];
        if (largestImage?.identification) {
          result.avatarUrl = largestImage.identification;
        }
      }
    }
  } catch {
    // Profile API call failed , this is expected if the app doesn't have r_basicprofile permission
    // We still have the basic OIDC data, so we continue
  }

  return result;
}

export async function buildLinkedInAuthUrl(
  redirectUri: string,
  state: string,
  workspaceId: string,
): Promise<string> {
  const creds = await getPortalLinkedInCredentials(workspaceId);
  if (!creds) throw new Error("LinkedIn OAuth not configured.");
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}
