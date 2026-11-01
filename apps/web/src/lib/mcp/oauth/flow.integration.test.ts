import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/public-origin", () => ({ getHarlyPublicOrigin: () => "https://harly.test" }));

// Runs the whole OAuth lifecycle against a real Postgres. Opt in with
// RUN_MCP_OAUTH_INTEGRATION=1 (needs DATABASE_URL and migration 0164 applied).
const integration = process.env.RUN_MCP_OAUTH_INTEGRATION === "1" ? describe : describe.skip;

import { db, mcpAuthorizationCodes, mcpGrants, mcpOauthClients, mcpTokens, member, organization, user } from "@harly/db";

import { approveAuthorization, validateAuthorizeRequest } from "./authorize";
import { registerDcrClient } from "./clients";
import { pkceS256Challenge } from "./crypto";
import { listMcpGrants, revokeAllMcpGrantsForUser, revokeMcpGrant, touchMcpGrant } from "./grants";
import { exchangeAuthorizationCode, refreshAccessToken, revokeToken } from "./token";
import { verifyMcpAccessToken } from "./verify";
import { updateWorkspaceMcpSettings } from "../settings";

integration("MCP OAuth lifecycle (real database)", () => {
  const suffix = randomUUID().slice(0, 8);
  const workspaceId = `ws_${suffix}`;
  const userId = `usr_${suffix}`;
  const memberId = `mem_${suffix}`;
  const verifier = "v".repeat(64);
  const redirect = "https://agent.test/cb";
  let clientId = "";

  beforeAll(async () => {
    await db.insert(organization).values({ id: workspaceId, name: "MCP Test", slug: `mcp-${suffix}`, createdAt: new Date() });
    await db.insert(user).values({ id: userId, name: "Tester", email: `${suffix}@mcp.test` });
    await db.insert(member).values({ id: memberId, organizationId: workspaceId, userId, role: "recruiter", createdAt: new Date() } as never);
    const reg = await registerDcrClient({ client_name: "Test Agent", redirect_uris: [redirect, "http://127.0.0.1/cb"] });
    clientId = reg.clientId;
  });

  afterAll(async () => {
    await db.delete(mcpOauthClients).where(eq(mcpOauthClients.clientId, clientId));
    await db.delete(organization).where(eq(organization.id, workspaceId));
    await db.delete(user).where(eq(user.id, userId));
  });

  async function issueCode(scope = "candidates:read jobs:read") {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirect,
      code_challenge: pkceS256Challenge(verifier),
      code_challenge_method: "S256",
      state: "s1",
      resource: "https://harly.test/mcp",
      scope,
    });
    const validation = await validateAuthorizeRequest(params);
    if (!validation.ok) throw new Error(`validation failed: ${validation.description}`);
    const location = new URL(
      await approveAuthorization({ request: validation.request, grantedScopes: validation.request.scopes, workspaceId, userId }),
    );
    expect(location.searchParams.get("state")).toBe("s1");
    expect(location.searchParams.get("iss")).toBe("https://harly.test");
    return location.searchParams.get("code")!;
  }

  const exchange = (code: string, over: Partial<Parameters<typeof exchangeAuthorizationCode>[0]> = {}) =>
    exchangeAuthorizationCode({ code, clientId, redirectUri: redirect, codeVerifier: verifier, ...over });

  it("code -> tokens -> verify -> refresh rotation -> reuse revokes the grant", async () => {
    const code = await issueCode();
    const first = await exchange(code);
    if (!first.ok) throw new Error(first.description);
    expect(first.response.expires_in).toBe(900);
    expect(first.response.scope).toBe("candidates:read jobs:read");

    // Only hashes are stored.
    const stored = await db.select().from(mcpTokens);
    expect(stored.some((t) => t.tokenHash === first.response.access_token)).toBe(false);

    const verified = await verifyMcpAccessToken(first.response.access_token);
    expect(verified).toMatchObject({ userId, workspaceId, clientId, clientName: "Test Agent", scopes: ["candidates:read", "jobs:read"] });
    expect(await verifyMcpAccessToken("hmat_garbage")).toBeNull();
    // A refresh token is not an access token.
    expect(await verifyMcpAccessToken(first.response.refresh_token)).toBeNull();

    const second = await refreshAccessToken({ refreshToken: first.response.refresh_token, clientId });
    if (!second.ok) throw new Error(second.description);
    expect(second.response.refresh_token).not.toBe(first.response.refresh_token);
    expect(await verifyMcpAccessToken(second.response.access_token)).not.toBeNull();

    // Immediate replay is treated as a client retry: refused, grant survives.
    const retry = await refreshAccessToken({ refreshToken: first.response.refresh_token, clientId });
    expect(retry).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(await verifyMcpAccessToken(second.response.access_token)).not.toBeNull();

    // Replay after the leeway = theft: the whole grant dies.
    await db.update(mcpTokens).set({ usedAt: new Date(Date.now() - 60_000) }).where(eq(mcpTokens.grantId, verified!.grantId));
    const reuse = await refreshAccessToken({ refreshToken: first.response.refresh_token, clientId });
    expect(reuse).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(await verifyMcpAccessToken(second.response.access_token)).toBeNull();
    const refreshed = await refreshAccessToken({ refreshToken: second.response.refresh_token, clientId });
    expect(refreshed.ok).toBe(false);
  });

  it("authorization codes are single use, bound to client, redirect and verifier", async () => {
    const wrongVerifier = await exchange(await issueCode(), { codeVerifier: "w".repeat(64) });
    expect(wrongVerifier).toMatchObject({ ok: false, error: "invalid_grant" });

    const wrongRedirect = await exchange(await issueCode(), { redirectUri: "https://agent.test/other" });
    expect(wrongRedirect).toMatchObject({ ok: false, error: "invalid_grant" });

    const wrongClient = await exchange(await issueCode(), { clientId: "hmc_someoneelse" });
    expect(wrongClient).toMatchObject({ ok: false, error: "invalid_grant" });

    const wrongResource = await exchange(await issueCode(), { resource: "https://other.test/mcp" });
    expect(wrongResource).toMatchObject({ ok: false, error: "invalid_target" });

    const code = await issueCode();
    const ok = await exchange(code);
    expect(ok.ok).toBe(true);
    // Replaying a spent code is a red flag: tokens minted from it are revoked.
    const replay = await exchange(code);
    expect(replay).toMatchObject({ ok: false, error: "invalid_grant" });
    if (ok.ok) expect(await verifyMcpAccessToken(ok.response.access_token)).toBeNull();
  });

  it("expired codes and tokens are refused", async () => {
    const code = await issueCode();
    await db.update(mcpAuthorizationCodes).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await exchange(code)).toMatchObject({ ok: false, error: "invalid_grant" });

    const fresh = await exchange(await issueCode());
    if (!fresh.ok) throw new Error(fresh.description);
    const grantId = (await verifyMcpAccessToken(fresh.response.access_token))!.grantId;
    await db.update(mcpTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(mcpTokens.grantId, grantId));
    expect(await verifyMcpAccessToken(fresh.response.access_token)).toBeNull();
    expect(await refreshAccessToken({ refreshToken: fresh.response.refresh_token, clientId })).toMatchObject({ ok: false });
  });

  it("stops working when the member is removed, MCP is disabled or the grant is revoked", async () => {
    const t = await exchange(await issueCode());
    if (!t.ok) throw new Error(t.description);
    expect(await verifyMcpAccessToken(t.response.access_token)).not.toBeNull();

    await updateWorkspaceMcpSettings(workspaceId, { enabled: false }, userId);
    expect(await verifyMcpAccessToken(t.response.access_token)).toBeNull();
    await updateWorkspaceMcpSettings(workspaceId, { enabled: true }, userId);
    expect(await verifyMcpAccessToken(t.response.access_token)).not.toBeNull();

    await db.update(member).set({ status: "suspended" } as never).where(eq(member.id, memberId));
    expect(await verifyMcpAccessToken(t.response.access_token)).toBeNull();
    await db.update(member).set({ status: "active" } as never).where(eq(member.id, memberId));

    const grantId = (await verifyMcpAccessToken(t.response.access_token))!.grantId;
    expect((await listMcpGrants({ workspaceId, userId })).some((g) => g.id === grantId)).toBe(true);
    await touchMcpGrant(grantId);
    expect(await revokeMcpGrant(grantId, { workspaceId: "other_ws" })).toBe(false);
    expect(await revokeMcpGrant(grantId, { workspaceId, revokedBy: userId })).toBe(true);
    expect(await verifyMcpAccessToken(t.response.access_token)).toBeNull();
    expect((await listMcpGrants({ workspaceId })).some((g) => g.id === grantId)).toBe(false);
  });

  it("RFC 7009 revocation of a refresh token ends the grant; access tokens revoke alone", async () => {
    const t = await exchange(await issueCode());
    if (!t.ok) throw new Error(t.description);
    await revokeToken(t.response.access_token, clientId);
    expect(await verifyMcpAccessToken(t.response.access_token)).toBeNull();
    expect(await refreshAccessToken({ refreshToken: t.response.refresh_token, clientId })).toMatchObject({ ok: true });

    const u = await exchange(await issueCode());
    if (!u.ok) throw new Error(u.description);
    await revokeToken(u.response.refresh_token, "hmc_wrong"); // wrong client: ignored
    expect(await verifyMcpAccessToken(u.response.access_token)).not.toBeNull();
    await revokeToken(u.response.refresh_token, clientId);
    expect(await verifyMcpAccessToken(u.response.access_token)).toBeNull();
    expect(await revokeAllMcpGrantsForUser(userId, workspaceId)).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(mcpGrants).where(eq(mcpGrants.userId, userId))).not.toHaveLength(0);
  });
});
