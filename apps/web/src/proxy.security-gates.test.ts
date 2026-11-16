import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  results: [] as unknown[][],
  calls: 0,
}));

function chain(result: unknown[]) {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown) => resolve(result);
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

vi.mock("@harly/auth/cookies", () => ({ getSessionCookie: () => "session-token" }));
vi.mock("@harly/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user-1", email: "member@example.test" },
        session: { id: "sess-1", activeOrganizationId: "org-1" },
      }),
    },
  },
}));
vi.mock("@harly/db", () => {
  const table = new Proxy({}, { get: (_t, p) => String(p) });
  return {
    db: {
      // proxy.ts issues the five lookups in a fixed order inside Promise.all.
      select: () => chain(state.results[state.calls++ % 5] ?? []),
      delete: () => chain([]),
    },
    workspaceSettings: table,
    member: table,
    user: table,
    passkeys: table,
    session: table,
  };
});

import { proxy } from "./proxy";

function setLookups(opts: {
  require2fa?: boolean;
  requirePasskey?: boolean;
  mustChangePassword?: boolean;
  hasTwoFactor?: boolean;
  ipAllowlist?: string[];
}) {
  state.calls = 0;
  state.results = [
    [
      {
        require2fa: opts.require2fa ?? false,
        ipAllowlist: opts.ipAllowlist ?? [],
        allowedDomains: [],
        requirePasskey: opts.requirePasskey ?? false,
        riskDetectionEnabled: false,
      },
    ],
    [{ role: "recruiter" }],
    [
      {
        twoFactorEnabled: opts.hasTwoFactor ?? false,
        mustChangePassword: opts.mustChangePassword ?? false,
      },
    ],
    [],
    [{ ipAddress: null, userAgent: null }],
  ];
}

function request(path: string, init?: { headers?: Record<string, string>; method?: string }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), init);
}

function redirectPath(response: Response) {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname : null;
}

describe("proxy: setup gates on the security pages", () => {
  beforeEach(() => {
    vi.stubEnv("HARLY_URL", "https://ats.example.test");
  });

  it("lets a GET of /settings/security through while 2FA setup is pending", async () => {
    setLookups({ require2fa: true });
    const response = await proxy(request("/settings/security"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not exempt a server action posted from /settings/security (forced 2FA)", async () => {
    setLookups({ require2fa: true });
    const response = await proxy(
      request("/settings/security", {
        method: "POST",
        headers: { "next-action": "abc123" },
      }),
    );
    expect(redirectPath(response)).toBe("/setup-2fa");
  });

  it("does not exempt a server action when a passkey is required", async () => {
    setLookups({ requirePasskey: true });
    const response = await proxy(
      request("/settings/security", {
        method: "POST",
        headers: { "next-action": "abc123" },
      }),
    );
    expect(redirectPath(response)).toBe("/setup-2fa");
  });

  it("does not exempt a server action while a password change is pending", async () => {
    setLookups({ mustChangePassword: true });
    const response = await proxy(
      request("/settings/security", {
        method: "POST",
        headers: { "next-action": "abc123" },
      }),
    );
    expect(redirectPath(response)).toBe("/change-password");
  });

  it("applies the IP allowlist to the security page too", async () => {
    setLookups({ ipAllowlist: ["10.0.0.0/8"] });
    const response = await proxy(
      request("/settings/security", {
        headers: { "x-forwarded-for": "203.0.113.5" },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("still gates ordinary dashboard pages", async () => {
    setLookups({ require2fa: true });
    const response = await proxy(request("/dashboard"));
    expect(redirectPath(response)).toBe("/setup-2fa");
  });
});
