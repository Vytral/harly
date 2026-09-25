import { afterEach, describe, expect, it, vi } from "vitest";

// isDemoMode reads process.env; we drive it by mutating DEMO_MODE and
// re-importing the module fresh so the guard reflects the current env.
async function loadGuard(demoMode: boolean) {
  vi.resetModules();
  if (demoMode) {
    process.env.DEMO_MODE = "true";
  } else {
    delete process.env.DEMO_MODE;
  }
  return import("./assert-not-demo");
}

afterEach(() => {
  delete process.env.DEMO_MODE;
  vi.resetModules();
});

describe("assertNotDemo", () => {
  it("throws a controlled DemoActionDisabledError in demo mode", async () => {
    const { assertNotDemo, DemoActionDisabledError } = await loadGuard(true);
    expect(() => assertNotDemo()).toThrow(DemoActionDisabledError);
    // The message is generic — no internal detail leaks to the caller.
    expect(() => assertNotDemo()).toThrow("This action is disabled in the demo.");
  });

  it("is a no-op on a normal install (DEMO_MODE unset)", async () => {
    const { assertNotDemo } = await loadGuard(false);
    expect(() => assertNotDemo()).not.toThrow();
  });

  it("is a no-op when DEMO_MODE is explicitly false", async () => {
    vi.resetModules();
    process.env.DEMO_MODE = "false";
    const { assertNotDemo } = await import("./assert-not-demo");
    expect(() => assertNotDemo()).not.toThrow();
  });
});

describe("isDemoActionBlocked", () => {
  it("blocks only when demo mode is true", async () => {
    const { isDemoActionBlocked } = await loadGuard(false);
    expect(isDemoActionBlocked(true)).toBe(true);
    expect(isDemoActionBlocked(false)).toBe(false);
  });
});
