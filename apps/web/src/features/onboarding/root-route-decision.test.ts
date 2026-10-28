import { describe, expect, it } from "vitest";

import { decideSignedInRootRoute } from "./root-route-decision";

describe("decideSignedInRootRoute", () => {
  it("leaves signed-out visitors on the public page", () => {
    expect(
      decideSignedInRootRoute({
        demo: false,
        signedIn: false,
        hasWorkspace: true,
        onboardingCompleted: true,
      }),
    ).toBeNull();
  });

  it("leaves demo visitors on the style picker, whatever their session", () => {
    expect(
      decideSignedInRootRoute({
        demo: true,
        signedIn: true,
        hasWorkspace: true,
        onboardingCompleted: true,
      }),
    ).toBeNull();
  });

  it("sends a finished member with a workspace to the dashboard", () => {
    expect(
      decideSignedInRootRoute({
        demo: false,
        signedIn: true,
        hasWorkspace: true,
        onboardingCompleted: true,
      }),
    ).toBe("/dashboard");
  });

  it("sends a member who has not finished onboarding to onboarding", () => {
    expect(
      decideSignedInRootRoute({
        demo: false,
        signedIn: true,
        hasWorkspace: true,
        onboardingCompleted: false,
      }),
    ).toBe("/onboarding");
  });

  it("sends a signed-in user with no workspace yet to onboarding", () => {
    expect(
      decideSignedInRootRoute({
        demo: false,
        signedIn: true,
        hasWorkspace: false,
        onboardingCompleted: false,
      }),
    ).toBe("/onboarding");
  });

  it("does not redirect a finished user with no workspace, to avoid a loop", () => {
    expect(
      decideSignedInRootRoute({
        demo: false,
        signedIn: true,
        hasWorkspace: false,
        onboardingCompleted: true,
      }),
    ).toBeNull();
  });
});
