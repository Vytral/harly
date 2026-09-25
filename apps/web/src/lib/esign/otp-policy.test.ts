import { describe, expect, it } from "vitest";

import { nextOtpAttempt } from "./otp-policy";

describe("nextOtpAttempt", () => {
  it("stops at the maximum instead of allowing another concurrent attempt", () => {
    expect(nextOtpAttempt(0, 5)).toBe(1);
    expect(nextOtpAttempt(4, 5)).toBe(5);
    expect(nextOtpAttempt(5, 5)).toBeNull();
  });
});
