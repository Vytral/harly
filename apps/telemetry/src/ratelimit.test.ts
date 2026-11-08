import { describe, expect, it } from "vitest";
import { RateLimiter } from "./ratelimit.js";

describe("RateLimiter", () => {
  it("caps memory by evicting the oldest keys", () => {
    const rl = new RateLimiter(30, 10, 100, () => 0);
    for (let i = 0; i < 1000; i++) rl.check(`10.0.${i >> 8}.${i & 255}`);
    expect(rl.size).toBeLessThanOrEqual(100);
  });

  it("drops idle entries after the TTL and all entries on salt rotation", () => {
    let t = 0;
    const rl = new RateLimiter(30, 10, 1000, () => t);
    rl.check("1.1.1.1");
    rl.check("2.2.2.2");
    expect(rl.size).toBe(2);
    t += 61_000;
    rl.check("3.3.3.3");
    expect(rl.size).toBe(1);
    t += 3600_000;
    rl.check("4.4.4.4");
    expect(rl.size).toBe(1);
  });

  it("refills tokens over time", () => {
    let t = 0;
    const rl = new RateLimiter(60, 2, 100, () => t);
    expect(rl.check("a")).toBe(0);
    expect(rl.check("a")).toBe(0);
    expect(rl.check("a")).toBeGreaterThan(0);
    t += 1000;
    expect(rl.check("a")).toBe(0);
  });
});
