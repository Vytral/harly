import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * End-to-end handshake of real MCP hosts against this server, without network
 * or Postgres: discovery -> dynamic registration -> /oauth/authorize (PKCE) ->
 * consent -> /oauth/token -> /mcp initialize + tools/list.
 *
 * The route handlers and lib/mcp code under test are the real ones. Only the
 * database (a tiny in-memory engine), the session, the rate limiter and the
 * consent gate are replaced. The registration payloads follow what Claude
 * (claude.ai / Claude Code) and ChatGPT send, per their public connector docs
 * and the MCP authorization spec (RFC 7591 / 7636 / 8414 / 9728 / 8707).
 */

vi.hoisted(() => {
  process.env.HARLY_URL = "https://harly.test";
});

// ── in-memory database ─────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

vi.mock("drizzle-orm", () => {
  type Ctx = Record<string, Row | undefined>;
  type Col = { __col: true; table: string; key: string };
  const isCol = (x: unknown): x is Col => !!x && typeof x === "object" && (x as Col).__col === true;
  const val = (x: unknown, ctx: Ctx) => (isCol(x) ? ctx[x.table]?.[x.key] : x);
  const num = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
  const pred = (fn: (ctx: Ctx) => boolean) => fn;
  return {
    eq: (a: unknown, b: unknown) => pred((c) => val(a, c) === val(b, c)),
    gt: (a: unknown, b: unknown) => pred((c) => num(val(a, c)) > num(val(b, c))),
    lt: (a: unknown, b: unknown) => pred((c) => num(val(a, c)) < num(val(b, c))),
    isNull: (a: unknown) => pred((c) => val(a, c) == null),
    isNotNull: (a: unknown) => pred((c) => val(a, c) != null),
    and: (...ps: unknown[]) => pred((c) => ps.filter(Boolean).every((p) => (p as (c: Ctx) => boolean)(c))),
    or: (...ps: unknown[]) => pred((c) => ps.filter(Boolean).some((p) => (p as (c: Ctx) => boolean)(c))),
    desc: (a: unknown) => a,
  };
});

vi.mock("@harly/db", () => {
  type Ctx = Record<string, Row | undefined>;
  type Col = { __col: true; table: string; key: string };
  const isCol = (x: unknown): x is Col => !!x && typeof x === "object" && (x as Col).__col === true;
  const table = (name: string) =>
    new Proxy({ __table: name } as Record<string, unknown>, {
      get: (t, key) => (key === "__table" ? name : ({ __col: true, table: name, key: String(key) } satisfies Col)),
    });
  const rowsOf = (name: string) => (store.tables[name] ??= []);
  const nameOf = (t: unknown) => (t as { __table: string }).__table;

  class Select {
    private joins: { table: string; on: (c: Ctx) => boolean; left: boolean }[] = [];
    private base = "";
    private predicate: ((c: Ctx) => boolean) | undefined;
    private max = Infinity;
    constructor(private fields?: Record<string, unknown>) {}
    from(t: unknown) {
      this.base = nameOf(t);
      return this;
    }
    innerJoin(t: unknown, on: (c: Ctx) => boolean) {
      this.joins.push({ table: nameOf(t), on, left: false });
      return this;
    }
    leftJoin(t: unknown, on: (c: Ctx) => boolean) {
      this.joins.push({ table: nameOf(t), on, left: true });
      return this;
    }
    where(p: (c: Ctx) => boolean) {
      this.predicate = p;
      return this;
    }
    orderBy() {
      return this;
    }
    limit(n: number) {
      this.max = n;
      return this;
    }
    then<T>(resolve: (rows: Row[]) => T, reject?: (e: unknown) => unknown) {
      try {
        let contexts: Ctx[] = rowsOf(this.base).map((row) => ({ [this.base]: row }));
        for (const join of this.joins) {
          contexts = contexts.flatMap((ctx) => {
            const matches = rowsOf(join.table).filter((row) => join.on({ ...ctx, [join.table]: row }));
            if (matches.length === 0) return join.left ? [{ ...ctx, [join.table]: undefined }] : [];
            return matches.map((row) => ({ ...ctx, [join.table]: row }));
          });
        }
        if (this.predicate) contexts = contexts.filter(this.predicate);
        const projected = contexts.slice(0, this.max).map((ctx) =>
          this.fields
            ? Object.fromEntries(
                Object.entries(this.fields).map(([key, f]) => [key, isCol(f) ? ctx[f.table]?.[f.key] : f]),
              )
            : { ...ctx[this.base] },
        );
        return Promise.resolve(projected).then(resolve, reject);
      } catch (error) {
        return Promise.reject(error).then(resolve, reject);
      }
    }
  }

  const insert = (t: unknown) => {
    const name = nameOf(t);
    let pending: Row[] = [];
    let conflict: { target: Col; set: Row } | undefined;
    const run = () => {
      for (const row of pending) {
        const full: Row = { id: randomUUID(), createdAt: new Date(), ...row };
        const existing = conflict ? rowsOf(name).find((r) => r[conflict!.target.key] === full[conflict!.target.key]) : undefined;
        if (existing) Object.assign(existing, conflict!.set);
        else rowsOf(name).push(full);
      }
      pending = [];
    };
    const builder = {
      values(v: Row | Row[]) {
        pending = Array.isArray(v) ? v : [v];
        return builder;
      },
      onConflictDoUpdate(c: { target: Col; set: Row }) {
        conflict = c;
        return builder;
      },
      then<T>(resolve: (v: undefined) => T, reject?: (e: unknown) => unknown) {
        try {
          run();
          return Promise.resolve(undefined).then(resolve, reject);
        } catch (e) {
          return Promise.reject(e).then(resolve, reject);
        }
      },
    };
    return builder;
  };

  const update = (t: unknown) => {
    const name = nameOf(t);
    let changes: Row = {};
    let predicate: (c: Ctx) => boolean = () => true;
    let returned: Row[] | undefined;
    const run = () => {
      returned = rowsOf(name).filter((row) => predicate({ [name]: row }));
      for (const row of returned) Object.assign(row, changes);
    };
    const builder = {
      set(v: Row) {
        changes = v;
        return builder;
      },
      where(p: (c: Ctx) => boolean) {
        predicate = p;
        return builder;
      },
      returning() {
        run();
        return Promise.resolve(returned!.map((r) => ({ ...r })));
      },
      then<T>(resolve: (v: undefined) => T, reject?: (e: unknown) => unknown) {
        try {
          run();
          return Promise.resolve(undefined).then(resolve, reject);
        } catch (e) {
          return Promise.reject(e).then(resolve, reject);
        }
      },
    };
    return builder;
  };

  const del = (t: unknown) => {
    const name = nameOf(t);
    return {
      where(p: (c: Ctx) => boolean) {
        store.tables[name] = rowsOf(name).filter((row) => !p({ [name]: row }));
        return Promise.resolve(undefined);
      },
    };
  };

  const names = [
    "mcpOauthClients",
    "mcpAuthorizationCodes",
    "mcpGrants",
    "mcpTokens",
    "member",
    "organization",
    "workspaceMcpSettings",
  ];
  return {
    db: { select: (fields?: Record<string, unknown>) => new Select(fields), insert, update, delete: del },
    ...Object.fromEntries(names.map((n) => [n, table(n)])),
  };
});

// ── other seams ────────────────────────────────────────────────────────────
const session = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => (session.signedIn ? { user: { id: "u1" } } : null)) } },
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/server/api/ratelimit", () => ({
  enforceRateLimit: vi.fn(async () => undefined),
  rateLimitResultFromError: () => null,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull: vi.fn(async () =>
    session.signedIn
      ? {
          organization: { id: "ws1", name: "Acme", slug: "acme", logo: null },
          user: { id: "u1", name: "Maxi", email: "max@acme.test" },
          roleKey: "owner",
        }
      : null,
  ),
  getWorkspaceContext: vi.fn(),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  getActorPermissions: vi.fn(async () => ["mcp:use", "candidates:view"]),
}));
// The workspace security gate hits many tables; its own tests cover it.
vi.mock("./consent", () => ({
  evaluateConsentGate: vi.fn(async (_ctx: unknown, request: { scopes: string[] }) => ({
    ok: true,
    settings: {},
    grantedScopes: request.scopes,
    ip: "203.0.113.9",
  })),
}));
vi.mock("./grants", () => ({
  purgeExpiredMcpSecrets: vi.fn(async () => undefined),
  revokeMcpGrant: vi.fn(async () => true),
}));
vi.mock("../server/workspace-summary", () => ({ buildWorkspaceSummary: vi.fn(async () => ({ workspace: { name: "Acme" } })) }));
vi.mock("../server/audit", () => ({ recordToolCall: vi.fn(async () => undefined), summarizeArgs: vi.fn() }));
vi.mock("../tools", async () => {
  const { defineMcpTool } = await import("../types");
  return {
    MCP_TOOLS: [
      defineMcpTool({
        name: "candidates_search",
        title: "Search candidates",
        description: "Search candidates by name or email and return ids, stages and links.",
        group: "candidates",
        scope: "candidates:read",
        permission: "candidates:view",
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        input: z.object({ query: z.string().describe("Name or email fragment.") }),
        async run() {
          return { results: [] };
        },
      }),
    ],
  };
});

import { GET as authorizeRoute } from "@/app/oauth/authorize/route";
import { POST as decisionRoute } from "@/app/oauth/consent/decision/route";
import { OPTIONS as registerOptions, POST as registerRoute } from "@/app/oauth/register/route";
import { POST as tokenRoute } from "@/app/oauth/token/route";
import { GET as asMetadataRoute } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as asMetadataMcpRoute } from "@/app/.well-known/oauth-authorization-server/mcp/route";
import { GET as oidcMetadataRoute } from "@/app/.well-known/openid-configuration/route";
import { GET as prmMcpRoute } from "@/app/.well-known/oauth-protected-resource/mcp/route";
import { GET as prmRootRoute } from "@/app/.well-known/oauth-protected-resource/route";
import { POST as mcpPost } from "@/app/mcp/route";

import { pkceS256Challenge } from "./crypto";
import { mergeInstanceSettings, resolveMcpSettings } from "../settings";

const ORIGIN = "https://harly.test";

type Profile = {
  name: string;
  registration: Record<string, unknown>;
  /** What the host puts in /authorize beyond the mandatory parameters. */
  authorize: { resource?: string; scope?: string };
  /** Token request flavour: form body, or form body + Basic client_id. */
  tokenAuth: "body" | "basic";
};

const PROFILES: Profile[] = [
  {
    name: "claude.ai",
    registration: {
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    authorize: { resource: `${ORIGIN}/mcp` },
    tokenAuth: "body",
  },
  {
    name: "claude.com (new callback host)",
    registration: {
      client_name: "Claude",
      redirect_uris: ["https://claude.com/api/mcp/auth_callback", "https://claude.ai/api/mcp/auth_callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    authorize: { resource: `${ORIGIN}/mcp`, scope: "candidates:read offline_access" },
    tokenAuth: "body",
  },
  {
    name: "ChatGPT connector",
    registration: {
      client_name: "ChatGPT",
      redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    // ChatGPT sends the URL the user typed as the resource, trailing slash included.
    authorize: { resource: `${ORIGIN}/mcp/`, scope: "candidates:read jobs:read" },
    tokenAuth: "body",
  },
  {
    name: "ChatGPT apps-manage (platform.openai.com)",
    registration: {
      client_name: "ChatGPT",
      redirect_uris: ["https://platform.openai.com/apps-manage/oauth"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    authorize: { resource: `${ORIGIN}/mcp` },
    tokenAuth: "body",
  },
  {
    name: "Claude Code (loopback, random port)",
    registration: {
      client_name: "Claude Code (harly)",
      redirect_uris: ["http://localhost:53682/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    authorize: { resource: `${ORIGIN}/mcp` },
    tokenAuth: "basic",
  },
  {
    name: "sloppy client (extra grants, secret auth method, no name)",
    registration: {
      redirect_uris: ["https://agent.example/cb"],
      grant_types: ["authorization_code", "implicit", "client_credentials"],
      response_types: ["code", "token"],
      token_endpoint_auth_method: "client_secret_post",
      scope: "candidates:read",
    },
    authorize: {},
    tokenAuth: "body",
  },
];

function json(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

function form(url: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}

function seedWorkspace(settingsRow?: Row) {
  store.tables = {
    organization: [{ id: "ws1", name: "Acme", createdAt: new Date() }],
    member: [{ id: "m1", userId: "u1", organizationId: "ws1", status: "active" }],
    workspaceMcpSettings: settingsRow ? [settingsRow] : [],
  };
}

beforeEach(() => {
  seedWorkspace();
  session.signedIn = false;
});

/** Read a JSON-RPC reply: plain JSON or the first SSE `data:` event. */
async function rpcReply(response: Response) {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text.split("\n").find((l) => l.startsWith("data:"));
    return JSON.parse(data!.slice(5).trim());
  }
  return JSON.parse(text);
}

function mcp(body: unknown, token?: string) {
  return new Request(`${ORIGIN}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("discovery", () => {
  it("challenges an anonymous /mcp call and points at metadata that agrees with it", async () => {
    const challenge = await mcpPost(mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }));
    expect(challenge.status).toBe(401);
    const header = challenge.headers.get("www-authenticate") ?? "";
    const metadataUrl = /resource_metadata="([^"]+)"/.exec(header)?.[1];
    expect(metadataUrl).toBe(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`);

    for (const route of [prmMcpRoute, prmRootRoute]) {
      const prm = await route().json();
      expect(prm.resource).toBe(`${ORIGIN}/mcp`);
      expect(prm.authorization_servers).toEqual([ORIGIN]);
      expect(prm.bearer_methods_supported).toContain("header");
    }

    for (const route of [asMetadataRoute, asMetadataMcpRoute, oidcMetadataRoute]) {
      const res = await route();
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      const as = await res.json();
      expect(as).toMatchObject({
        issuer: ORIGIN,
        authorization_endpoint: `${ORIGIN}/oauth/authorize`,
        token_endpoint: `${ORIGIN}/oauth/token`,
        registration_endpoint: `${ORIGIN}/oauth/register`,
        code_challenge_methods_supported: ["S256"],
      });
      expect(as.grant_types_supported).toEqual(expect.arrayContaining(["authorization_code", "refresh_token"]));
      expect(as.token_endpoint_auth_methods_supported).toContain("none");
      expect(as.response_types_supported).toEqual(["code"]);
    }
  });

  it("answers the registration preflight a browser client sends", () => {
    const res = registerOptions();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("content-type");
  });
});

describe.each(PROFILES)("handshake: $name", (profile) => {
  it("registers, authorizes with PKCE, exchanges the code and lists tools", async () => {
    // 1. Dynamic client registration.
    const reg = await registerRoute(json(`${ORIGIN}/oauth/register`, profile.registration, { origin: "https://claude.ai" }));
    expect(reg.status).toBe(201);
    const registered = await reg.json();
    expect(registered.client_id).toMatch(/^hmc_/);
    expect(registered.redirect_uris).toEqual(profile.registration.redirect_uris);
    expect(registered.token_endpoint_auth_method).toBe("none");
    expect(registered.grant_types).toContain("authorization_code");

    // 2. Authorization request (browser, anonymous first).
    const verifier = `${profile.name.length}`.padEnd(64, "v");
    const redirectUri = (profile.registration.redirect_uris as string[])[0]!;
    const query = new URLSearchParams({
      response_type: "code",
      client_id: registered.client_id,
      redirect_uri: redirectUri,
      code_challenge: pkceS256Challenge(verifier),
      code_challenge_method: "S256",
      state: "opaque-state-123",
      ...(profile.authorize.resource ? { resource: profile.authorize.resource } : {}),
      ...(profile.authorize.scope ? { scope: profile.authorize.scope } : {}),
    });
    const anonymous = await authorizeRoute(new Request(`${ORIGIN}/oauth/authorize?${query}`));
    expect(anonymous.status).toBe(303);
    const login = new URL(anonymous.headers.get("location")!);
    expect(login.pathname).toBe("/login");
    // After sign-in the user must come back with every parameter intact.
    expect(login.searchParams.get("redirect")).toBe(`/oauth/authorize?${query}`);

    session.signedIn = true;
    const signedIn = await authorizeRoute(new Request(`${ORIGIN}/oauth/authorize?${query}`));
    expect(signedIn.status).toBe(303);
    const consent = new URL(signedIn.headers.get("location")!);
    expect(`${consent.origin}${consent.pathname}`).toBe(`${ORIGIN}/oauth/consent`);
    expect(consent.searchParams.get("client_id")).toBe(registered.client_id);

    // 3. The person presses "Allow access" on the consent page.
    const decision = new FormData();
    decision.set("decision", "approve");
    decision.set("request", consent.searchParams.toString());
    decision.set("workspace", "ws1");
    const approved = await decisionRoute(
      new Request(`${ORIGIN}/oauth/consent/decision`, { method: "POST", headers: { origin: ORIGIN }, body: decision }),
    );
    expect(approved.status).toBe(303);
    const back = new URL(approved.headers.get("location")!);
    expect(`${back.origin}${back.pathname}`).toBe(new URL(redirectUri).origin + new URL(redirectUri).pathname);
    expect(back.searchParams.get("state")).toBe("opaque-state-123");
    expect(back.searchParams.get("iss")).toBe(ORIGIN);
    const code = back.searchParams.get("code")!;
    expect(code).toMatch(/^hmac_/);

    // 4. Token exchange.
    const tokenFields: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      ...(profile.authorize.resource ? { resource: profile.authorize.resource } : {}),
      ...(profile.tokenAuth === "body" ? { client_id: registered.client_id } : {}),
    };
    const tokenHeaders: Record<string, string> =
      profile.tokenAuth === "basic"
        ? { authorization: `Basic ${Buffer.from(`${registered.client_id}:`).toString("base64")}` }
        : {};
    const tokenRes = await tokenRoute(form(`${ORIGIN}/oauth/token`, tokenFields, tokenHeaders));
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.headers.get("cache-control")).toBe("no-store");
    const tokens = await tokenRes.json();
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 900 });
    expect(tokens.access_token).toMatch(/^hmat_/);
    expect(tokens.refresh_token).toMatch(/^hmrt_/);

    // The same code cannot be used twice.
    const replay = await tokenRoute(form(`${ORIGIN}/oauth/token`, { ...tokenFields, client_id: registered.client_id }));
    expect(replay.status).toBe(400);

    // 5. Streamable HTTP: initialize, initialized notification, tools/list.
    const init = await mcpPost(
      mcp(
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: profile.name, version: "1" } } },
        tokens.access_token,
      ),
    );
    expect(init.status).toBe(200);
    expect((await rpcReply(init)).result.serverInfo).toBeDefined();

    const initialized = await mcpPost(mcp({ jsonrpc: "2.0", method: "notifications/initialized" }, tokens.access_token));
    expect(initialized.status).toBe(202);

    const list = await rpcReply(await mcpPost(mcp({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, tokens.access_token)));
    expect(list.result.tools.map((t: { name: string }) => t.name)).toContain("candidates_search");
  });
});

describe("refusals are specific and safe", () => {
  async function authorizeWith(overrides: Record<string, string>) {
    const query = new URLSearchParams({
      response_type: "code",
      client_id: "hmc_does_not_exist",
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      code_challenge: pkceS256Challenge("v".repeat(64)),
      code_challenge_method: "S256",
      state: "s",
      ...overrides,
    });
    return authorizeRoute(new Request(`${ORIGIN}/oauth/authorize?${query}`));
  }

  it("an unregistered client lands on the error page with a fixed reason, never on its redirect_uri", async () => {
    const res = await authorizeWith({});
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe(`${ORIGIN}/oauth/consent`);
    expect(to.searchParams.get("request_error")).toBe("invalid_client");
    expect(to.searchParams.get("request_error_reason")).toBe("client_unknown");
  });

  it("an expired registration is reported as expired", async () => {
    store.tables.mcpOauthClients = [
      { clientId: "hmc_old", source: "dcr", name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"], expiresAt: new Date(Date.now() - 1000), lastUsedAt: null },
    ];
    const to = new URL((await authorizeWith({ client_id: "hmc_old" })).headers.get("location")!);
    expect(to.searchParams.get("request_error_reason")).toBe("client_expired");
  });

  it("a redirect_uri that was not registered is reported as a mismatch, not redirected to", async () => {
    const reg = await (await registerRoute(json(`${ORIGIN}/oauth/register`, { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }))).json();
    const res = await authorizeWith({ client_id: reg.client_id, redirect_uri: "https://evil.example/cb" });
    const to = new URL(res.headers.get("location")!);
    expect(to.origin).toBe(ORIGIN);
    expect(to.searchParams.get("request_error_reason")).toBe("redirect_uri_mismatch");
  });

  it("a wrong resource is returned to the (validated) redirect_uri as invalid_target", async () => {
    const reg = await (await registerRoute(json(`${ORIGIN}/oauth/register`, { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }))).json();
    const res = await authorizeWith({ client_id: reg.client_id, resource: "https://other.example/mcp" });
    const to = new URL(res.headers.get("location")!);
    expect(to.origin).toBe("https://claude.ai");
    expect(to.searchParams.get("error")).toBe("invalid_target");
    expect(to.searchParams.get("state")).toBe("s");
  });

  it("registration rejects dangerous redirect URIs with an RFC 7591 error", async () => {
    for (const uri of ["javascript:alert(1)", "http://evil.example/cb"]) {
      const res = await registerRoute(json(`${ORIGIN}/oauth/register`, { client_name: "x", redirect_uris: [uri] }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_redirect_uri");
    }
  });
});

describe("the automatic-registration switch", () => {
  it("with it off, discovery drops registration_endpoint and /register answers 403", async () => {
    seedWorkspace({ workspaceId: "ws1", enabled: true, clientMode: "any", allowDcr: false, maxScopes: null });
    expect((await (await asMetadataRoute()).json()).registration_endpoint).toBeUndefined();
    const res = await registerRoute(json(`${ORIGIN}/oauth/register`, PROFILES[0]!.registration));
    expect(res.status).toBe(403);
  });

  it("reads the policy the owner saved even when another workspace exists on the instance", async () => {
    // The oldest workspace is an untouched one; the owner saved their policy in a second one.
    store.tables.organization = [
      { id: "ws0", name: "Old", createdAt: new Date(0) },
      { id: "ws1", name: "Acme", createdAt: new Date() },
    ];
    store.tables.workspaceMcpSettings = [{ workspaceId: "ws1", enabled: true, clientMode: "any", allowDcr: true, maxScopes: null }];
    const res = await registerRoute(json(`${ORIGIN}/oauth/register`, PROFILES[0]!.registration));
    expect(res.status).toBe(201);

    // ...and an owner who switched it off is not overridden by an untouched workspace.
    store.tables.workspaceMcpSettings = [{ workspaceId: "ws1", enabled: true, clientMode: "any", allowDcr: false, maxScopes: null }];
    expect((await registerRoute(json(`${ORIGIN}/oauth/register`, PROFILES[0]!.registration))).status).toBe(403);
  });

  it("merges saved workspace policies without re-opening what is off", () => {
    const on = resolveMcpSettings("a", { enabled: true, clientMode: "any", allowDcr: true, maxScopes: null });
    const off = resolveMcpSettings("b", { enabled: false, clientMode: "any", allowDcr: true, maxScopes: null });
    expect(mergeInstanceSettings([off, on]).allowDcr).toBe(true);
    expect(mergeInstanceSettings([off]).enabled).toBe(false);
  });
});
