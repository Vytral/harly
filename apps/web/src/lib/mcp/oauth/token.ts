import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";

import { db, mcpAuthorizationCodes, mcpGrants, mcpTokens, member } from "@harly/db";

import { isMcpEnabledForWorkspace } from "../settings";
import {
  MCP_ACCESS_TOKEN_PREFIX,
  MCP_ACCESS_TOKEN_TTL_S,
  MCP_REFRESH_IDLE_TTL_S,
  MCP_REFRESH_REPLAY_LEEWAY_MS,
  MCP_REFRESH_TOKEN_PREFIX,
  mcpResource,
} from "./config";
import { generateOpaqueToken, sha256Hex, verifyPkceS256 } from "./crypto";
import { purgeExpiredMcpSecrets, revokeMcpGrant } from "./grants";
import { resourceMatches } from "./authorize";

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export type TokenFailure = {
  ok: false;
  status: 400 | 401;
  error: "invalid_request" | "invalid_grant" | "invalid_client" | "invalid_target" | "unsupported_grant_type";
  description: string;
};
export type TokenResult = { ok: true; response: TokenResponse } | TokenFailure;

const fail = (
  error: TokenFailure["error"],
  description: string,
  status: 400 | 401 = 400,
): TokenFailure => ({ ok: false, status, error, description });

/** Pure: the refresh token expiry is the idle window, capped by the grant. */
export function refreshExpiry(now: number, grantExpiresAt: Date): Date {
  return new Date(Math.min(now + MCP_REFRESH_IDLE_TTL_S * 1000, grantExpiresAt.getTime()));
}

function resourceMismatch(requested: string | undefined, bound: string): boolean {
  return requested !== undefined && !resourceMatches(requested, bound);
}

type GrantRow = {
  id: string;
  workspaceId: string;
  userId: string;
  scopes: string[];
  expiresAt: Date;
};

async function loadUsableGrant(grantId: string, clientId: string): Promise<GrantRow | null> {
  const now = new Date();
  const [row] = await db
    .select({
      id: mcpGrants.id,
      workspaceId: mcpGrants.workspaceId,
      userId: mcpGrants.userId,
      scopes: mcpGrants.scopes,
      expiresAt: mcpGrants.expiresAt,
      clientId: mcpGrants.clientId,
    })
    .from(mcpGrants)
    .innerJoin(
      member,
      and(
        eq(member.userId, mcpGrants.userId),
        eq(member.organizationId, mcpGrants.workspaceId),
        eq(member.status, "active"),
      ),
    )
    .where(and(eq(mcpGrants.id, grantId), isNull(mcpGrants.revokedAt), gt(mcpGrants.expiresAt, now)))
    .limit(1);
  if (!row || row.clientId !== clientId) return null;
  if (!(await isMcpEnabledForWorkspace(row.workspaceId))) return null;
  return row;
}

async function mintTokens(grant: GrantRow): Promise<TokenResponse> {
  const now = Date.now();
  const resource = mcpResource();
  const accessToken = generateOpaqueToken(MCP_ACCESS_TOKEN_PREFIX);
  const refreshToken = generateOpaqueToken(MCP_REFRESH_TOKEN_PREFIX);
  await db.insert(mcpTokens).values([
    {
      tokenHash: sha256Hex(accessToken),
      kind: "access",
      grantId: grant.id,
      resource,
      expiresAt: new Date(now + MCP_ACCESS_TOKEN_TTL_S * 1000),
    },
    {
      tokenHash: sha256Hex(refreshToken),
      kind: "refresh",
      grantId: grant.id,
      resource,
      expiresAt: refreshExpiry(now, grant.expiresAt),
    },
  ]);
  void purgeExpiredMcpSecrets().catch(() => undefined);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: MCP_ACCESS_TOKEN_TTL_S,
    refresh_token: refreshToken,
    scope: grant.scopes.join(" "),
  };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}): Promise<TokenResult> {
  const hash = sha256Hex(input.code);
  // Claim atomically: a code can be presented exactly once, valid or not.
  const [claimed] = await db
    .update(mcpAuthorizationCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(mcpAuthorizationCodes.codeHash, hash), isNull(mcpAuthorizationCodes.usedAt)))
    .returning();

  if (!claimed) {
    // Replay of a spent code: assume interception and kill what it produced.
    const [spent] = await db
      .select({ grantId: mcpAuthorizationCodes.grantId })
      .from(mcpAuthorizationCodes)
      .where(eq(mcpAuthorizationCodes.codeHash, hash))
      .limit(1);
    if (spent) {
      const [grant] = await db
        .select({ workspaceId: mcpGrants.workspaceId })
        .from(mcpGrants)
        .where(eq(mcpGrants.id, spent.grantId))
        .limit(1);
      if (grant) await revokeMcpGrant(spent.grantId, { workspaceId: grant.workspaceId, reason: "authorization_code_reuse" });
    }
    return fail("invalid_grant", "The authorization code is invalid, expired or already used.");
  }

  if (claimed.expiresAt <= new Date()) return fail("invalid_grant", "The authorization code has expired.");
  if (claimed.clientId !== input.clientId) return fail("invalid_grant", "The authorization code was issued to another client.");
  if (claimed.redirectUri !== input.redirectUri) return fail("invalid_grant", "redirect_uri does not match the authorization request.");
  if (resourceMismatch(input.resource, claimed.resource)) return fail("invalid_target", "resource does not match the authorization request.");
  if (!verifyPkceS256(input.codeVerifier, claimed.codeChallenge)) {
    return fail("invalid_grant", "PKCE verification failed.");
  }

  const grant = await loadUsableGrant(claimed.grantId, input.clientId);
  if (!grant) return fail("invalid_grant", "The grant is no longer active.");
  return { ok: true, response: await mintTokens(grant) };
}

export async function refreshAccessToken(input: {
  refreshToken: string;
  clientId: string;
  resource?: string;
}): Promise<TokenResult> {
  const hash = sha256Hex(input.refreshToken);
  const [row] = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.tokenHash, hash), eq(mcpTokens.kind, "refresh")))
    .limit(1);
  if (!row) return fail("invalid_grant", "The refresh token is invalid.");
  if (resourceMismatch(input.resource, row.resource)) return fail("invalid_target", "resource does not match the original grant.");

  const [grantRow] = await db
    .select({ workspaceId: mcpGrants.workspaceId, clientId: mcpGrants.clientId })
    .from(mcpGrants)
    .where(eq(mcpGrants.id, row.grantId))
    .limit(1);
  if (!grantRow || grantRow.clientId !== input.clientId) {
    return fail("invalid_grant", "The refresh token was issued to another client.");
  }

  const reuse = async (): Promise<TokenFailure> => {
    // A client retrying after a lost response replays within seconds; anything
    // later is a second holder of the secret, so the whole grant is revoked.
    const usedAt = row.usedAt?.getTime() ?? 0;
    if (Date.now() - usedAt > MCP_REFRESH_REPLAY_LEEWAY_MS) {
      await revokeMcpGrant(row.grantId, { workspaceId: grantRow.workspaceId, reason: "refresh_token_reuse" });
    }
    return fail("invalid_grant", "The refresh token has already been used.");
  };

  if (row.usedAt) return reuse();
  if (row.expiresAt <= new Date()) return fail("invalid_grant", "The refresh token has expired.");

  const [claimed] = await db
    .update(mcpTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(mcpTokens.id, row.id), isNull(mcpTokens.usedAt)))
    .returning({ id: mcpTokens.id });
  if (!claimed) {
    // Lost a race with a concurrent refresh using the same token.
    return fail("invalid_grant", "The refresh token has already been used.");
  }

  const grant = await loadUsableGrant(row.grantId, input.clientId);
  if (!grant) return fail("invalid_grant", "The grant is no longer active.");
  return { ok: true, response: await mintTokens(grant) };
}

/** RFC 7009. Always succeeds from the caller's view; unknown tokens are ignored. */
export async function revokeToken(token: string, clientId?: string): Promise<void> {
  const [row] = await db
    .select({ id: mcpTokens.id, kind: mcpTokens.kind, grantId: mcpTokens.grantId })
    .from(mcpTokens)
    .where(eq(mcpTokens.tokenHash, sha256Hex(token)))
    .limit(1);
  if (!row) return;
  const [grant] = await db
    .select({ workspaceId: mcpGrants.workspaceId, clientId: mcpGrants.clientId, userId: mcpGrants.userId })
    .from(mcpGrants)
    .where(eq(mcpGrants.id, row.grantId))
    .limit(1);
  if (!grant) return;
  if (clientId && clientId !== grant.clientId) return;
  if (row.kind === "refresh") {
    // Revoking the refresh token ends the whole authorization.
    await revokeMcpGrant(row.grantId, { workspaceId: grant.workspaceId, revokedBy: grant.userId, reason: "client_revoked" });
  } else {
    await db.delete(mcpTokens).where(eq(mcpTokens.id, row.id));
  }
}
