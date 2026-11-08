import { describe, expect, it } from "vitest";

import {
  DEFAULT_PORTAL_AUTH_CONFIG,
  PORTAL_METHOD_KEYS,
  parsePortalAuthConfig,
  resolvePortalAuthMethods,
  validatePortalAuthConfig,
  type PortalAuthConfig,
  type PortalAuthRequirements,
} from "./portal-auth-methods-core";

const none: PortalAuthRequirements = {
  emailReady: false,
  google: false,
  github: false,
  linkedin: false,
};
const all: PortalAuthRequirements = {
  emailReady: true,
  google: true,
  github: true,
  linkedin: true,
};
const off: PortalAuthConfig = {
  password: false,
  accessCode: false,
  magicLink: false,
  google: false,
  github: false,
  linkedin: false,
  passkey: false,
};

describe("parsePortalAuthConfig", () => {
  it("defaults to password + access code when never configured", () => {
    for (const raw of [null, undefined, "x", [], 3]) {
      expect(parsePortalAuthConfig(raw)).toEqual(DEFAULT_PORTAL_AUTH_CONFIG);
    }
    expect(DEFAULT_PORTAL_AUTH_CONFIG.password).toBe(true);
    expect(DEFAULT_PORTAL_AUTH_CONFIG.accessCode).toBe(true);
    expect(DEFAULT_PORTAL_AUTH_CONFIG.magicLink).toBe(false);
  });

  it("keeps stored booleans and ignores junk values", () => {
    const parsed = parsePortalAuthConfig({ password: false, magicLink: "yes", google: true });
    expect(parsed.password).toBe(false);
    expect(parsed.magicLink).toBe(false);
    expect(parsed.google).toBe(true);
  });
});

describe("resolvePortalAuthMethods", () => {
  it("offers password and access code on a fresh instance with no integrations", () => {
    const m = resolvePortalAuthMethods(null, none);
    expect(m).toMatchObject({ password: true, accessCode: true, magicLink: false, passkey: false, fallback: false });
    expect(m.oauth).toEqual({ google: false, github: false, linkedin: false });
  });

  it("never offers magic link without outgoing email, even when enabled", () => {
    const m = resolvePortalAuthMethods({ ...off, password: true, magicLink: true }, none);
    expect(m.magicLink).toBe(false);
    expect(m.details.magicLink).toMatchObject({ enabled: true, available: false });
    expect(m.details.magicLink.reason).toMatch(/outgoing email/);
  });

  it("offers magic link only when enabled AND email exists", () => {
    const cfg = { ...off, magicLink: true };
    expect(resolvePortalAuthMethods(cfg, { ...none, emailReady: true }).magicLink).toBe(true);
    expect(resolvePortalAuthMethods({ ...cfg, magicLink: false, password: true }, all).magicLink).toBe(false);
  });

  it.each(["google", "github", "linkedin"] as const)("%s needs both the toggle and credentials", (p) => {
    const cfg = { ...off, password: true, [p]: true };
    expect(resolvePortalAuthMethods(cfg, none).oauth[p]).toBe(false);
    expect(resolvePortalAuthMethods(cfg, { ...none, [p]: true }).oauth[p]).toBe(true);
    expect(resolvePortalAuthMethods({ ...cfg, [p]: false }, all).oauth[p]).toBe(false);
  });

  it("explains a missing OAuth requirement", () => {
    const m = resolvePortalAuthMethods({ ...off, password: true, google: true }, none);
    expect(m.details.google.reason).toMatch(/Google needs OAuth credentials/);
  });

  it("falls back to password when nothing else is usable (email removed later)", () => {
    const m = resolvePortalAuthMethods({ ...off, magicLink: true }, none);
    expect(m.fallback).toBe(true);
    expect(m.password).toBe(true);
  });

  it("does not count passkeys alone as a way in", () => {
    const m = resolvePortalAuthMethods({ ...off, passkey: true }, none);
    expect(m.fallback).toBe(true);
    expect(m.passkey).toBe(true);
    expect(m.password).toBe(true);
  });

  it("legacy migrated config keeps magic link and OAuth behaviour", () => {
    const legacy = { ...off, magicLink: true, google: true, github: true, linkedin: true };
    const m = resolvePortalAuthMethods(legacy, { emailReady: true, google: true, github: false, linkedin: false });
    expect(m).toMatchObject({ magicLink: true, password: false, fallback: false });
    expect(m.oauth).toEqual({ google: true, github: false, linkedin: false });
  });

  it("covers every combination of toggles x requirements without ever returning zero primary methods", () => {
    const keys = PORTAL_METHOD_KEYS;
    for (let mask = 0; mask < 2 ** keys.length; mask++) {
      const cfg = Object.fromEntries(keys.map((k, i) => [k, Boolean(mask & (1 << i))])) as PortalAuthConfig;
      for (let r = 0; r < 16; r++) {
        const req = { emailReady: !!(r & 1), google: !!(r & 2), github: !!(r & 4), linkedin: !!(r & 8) };
        const m = resolvePortalAuthMethods(cfg, req);
        expect(m.password || m.accessCode || m.magicLink || m.oauth.google || m.oauth.github || m.oauth.linkedin).toBe(true);
      }
    }
  });
});

describe("validatePortalAuthConfig (last-method rule)", () => {
  it("rejects turning off the last usable method", () => {
    const only = { ...off, password: true };
    const r = validatePortalAuthConfig({ ...only, password: false }, none);
    expect(r.ok).toBe(false);
  });

  it("rejects a config whose only enabled methods lack their requirements", () => {
    expect(validatePortalAuthConfig({ ...off, magicLink: true, google: true }, none).ok).toBe(false);
  });

  it("rejects passkey-only", () => {
    expect(validatePortalAuthConfig({ ...off, passkey: true }, all).ok).toBe(false);
  });

  it("accepts any single usable primary method", () => {
    expect(validatePortalAuthConfig({ ...off, accessCode: true }, none).ok).toBe(true);
    expect(validatePortalAuthConfig({ ...off, magicLink: true }, { ...none, emailReady: true }).ok).toBe(true);
    expect(validatePortalAuthConfig({ ...off, github: true }, { ...none, github: true }).ok).toBe(true);
  });
});
