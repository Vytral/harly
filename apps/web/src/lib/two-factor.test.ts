import { describe, expect, it } from "vitest";

import { isExemptFrom2fa, mustSetUp2fa } from "@/lib/two-factor";

describe("isExemptFrom2fa", () => {
  it("does not exempt the owner", () => {
    expect(isExemptFrom2fa("owner")).toBe(false);
  });

  it("does not exempt other roles", () => {
    for (const role of ["admin", "recruiter", "hiring_manager", "custom-sourcer"]) {
      expect(isExemptFrom2fa(role)).toBe(false);
    }
  });

  it("does not exempt a missing role", () => {
    expect(isExemptFrom2fa(null)).toBe(false);
    expect(isExemptFrom2fa(undefined)).toBe(false);
  });
});

describe("mustSetUp2fa", () => {
  it("never forces setup when the workspace doesn't require 2FA", () => {
    expect(
      mustSetUp2fa({
        workspaceRequires2fa: false,
        userHas2fa: false,
        roleKey: "recruiter",
      }),
    ).toBe(false);
  });

  it("never forces setup when the user already has 2FA", () => {
    expect(
      mustSetUp2fa({
        workspaceRequires2fa: true,
        userHas2fa: true,
        roleKey: "recruiter",
      }),
    ).toBe(false);
  });

  it("forces a non-exempt member without 2FA to set it up when required", () => {
    expect(
      mustSetUp2fa({
        workspaceRequires2fa: true,
        userHas2fa: false,
        roleKey: "recruiter",
      }),
    ).toBe(true);
  });

  it("also requires the owner to set up 2FA when required", () => {
    expect(
      mustSetUp2fa({
        workspaceRequires2fa: true,
        userHas2fa: false,
        roleKey: "owner",
      }),
    ).toBe(true);
  });
});
