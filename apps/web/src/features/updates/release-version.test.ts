import { describe, expect, it } from "vitest";

import {
  autoUpdateAllows,
  classifyUpdate,
  compareReleaseVersions,
  isStableReleaseVersion,
} from "./release-version";

describe("classifyUpdate", () => {
  it("names the size of the jump", () => {
    expect(classifyUpdate("0.2.4", "0.2.5")).toBe("patch");
    expect(classifyUpdate("0.2.4", "0.3.0")).toBe("minor");
    expect(classifyUpdate("0.9.9", "1.0.0")).toBe("major");
  });

  it("is null for the same version, a downgrade, or a non-version", () => {
    expect(classifyUpdate("0.2.4", "0.2.4")).toBeNull();
    expect(classifyUpdate("0.2.5", "0.2.4")).toBeNull();
    expect(classifyUpdate("a1b2c3d4e5f6", "0.2.4")).toBeNull();
  });
});

describe("compareReleaseVersions", () => {
  it("orders a prerelease before its release", () => {
    expect(compareReleaseVersions("0.3.0-rc.1", "0.3.0")).toBeLessThan(0);
    expect(compareReleaseVersions("v0.3.0", "0.3.0")).toBe(0);
  });
});

describe("autoUpdateAllows", () => {
  it("patch-only installs patch releases and nothing larger", () => {
    expect(autoUpdateAllows("patch", "0.2.4", "0.2.5")).toBe(true);
    expect(autoUpdateAllows("patch", "0.2.4", "0.3.0")).toBe(false);
  });

  it("minor installs patch and minor releases", () => {
    expect(autoUpdateAllows("minor", "0.2.4", "0.2.5")).toBe(true);
    expect(autoUpdateAllows("minor", "0.2.4", "0.3.0")).toBe(true);
  });

  it("never installs a major release unattended", () => {
    expect(autoUpdateAllows("minor", "0.9.0", "1.0.0")).toBe(false);
  });

  it("never installs a prerelease, a downgrade, or an unversioned build", () => {
    expect(isStableReleaseVersion("0.3.0-rc.1")).toBe(false);
    expect(autoUpdateAllows("minor", "0.2.4", "0.3.0-rc.1")).toBe(false);
    expect(autoUpdateAllows("minor", "0.2.5", "0.2.4")).toBe(false);
    expect(autoUpdateAllows("minor", "dev", "0.2.5")).toBe(false);
  });
});
