import { describe, expect, it } from "vitest";

import {
  DEMO_BLOCKED_AUTH_PATHS,
  isDemoBlockedAuthPath,
  shouldBlockAuthPath,
} from "./demo-guard";

describe("isDemoBlockedAuthPath", () => {
  it("flags every sensitive identity/security mutation path", () => {
    for (const path of DEMO_BLOCKED_AUTH_PATHS) {
      expect(isDemoBlockedAuthPath(path)).toBe(true);
    }
  });

  it("covers the highest-risk account credential paths explicitly", () => {
    // These are the ones that would lock every future visitor out.
    expect(isDemoBlockedAuthPath("/change-password")).toBe(true);
    expect(isDemoBlockedAuthPath("/change-email")).toBe(true);
    expect(isDemoBlockedAuthPath("/two-factor/enable")).toBe(true);
    expect(isDemoBlockedAuthPath("/organization/delete")).toBe(true);
    expect(isDemoBlockedAuthPath("/organization/leave")).toBe(true);
  });

  it("blocks credential sign-in so only /api/demo/enter can mint sessions", () => {
    expect(isDemoBlockedAuthPath("/sign-in/email")).toBe(true);
    expect(isDemoBlockedAuthPath("/sign-in/social")).toBe(true);
    expect(isDemoBlockedAuthPath("/forget-password")).toBe(true);
    expect(isDemoBlockedAuthPath("/reset-password")).toBe(true);
  });

  it("does not block sign-out, read, or set-active navigation", () => {
    // These must keep working so a visitor can leave and move around the demo.
    for (const path of [
      "/sign-out",
      "/get-session",
      "/list-sessions",
      "/organization/set-active",
      "/organization/list",
    ]) {
      expect(isDemoBlockedAuthPath(path)).toBe(false);
    }
  });

  it("is null/undefined safe", () => {
    expect(isDemoBlockedAuthPath(undefined)).toBe(false);
    expect(isDemoBlockedAuthPath(null)).toBe(false);
    expect(isDemoBlockedAuthPath("")).toBe(false);
  });
});

describe("shouldBlockAuthPath", () => {
  it("blocks a sensitive path only when demo mode is ON", () => {
    expect(shouldBlockAuthPath("/change-password", true)).toBe(true);
  });

  it("allows the same sensitive path when demo mode is OFF (normal install)", () => {
    // The core guarantee: a real Harly install is never affected.
    expect(shouldBlockAuthPath("/change-password", false)).toBe(false);
    expect(shouldBlockAuthPath("/organization/delete", false)).toBe(false);
    expect(shouldBlockAuthPath("/two-factor/enable", false)).toBe(false);
  });

  it("blocks sign-in/email only when demo mode is ON", () => {
    expect(shouldBlockAuthPath("/sign-in/email", true)).toBe(true);
    expect(shouldBlockAuthPath("/sign-in/email", false)).toBe(false);
  });

  it("never blocks a safe navigation path, in demo mode or not", () => {
    expect(shouldBlockAuthPath("/sign-out", true)).toBe(false);
    expect(shouldBlockAuthPath("/sign-out", false)).toBe(false);
    expect(shouldBlockAuthPath("/get-session", true)).toBe(false);
  });
});
