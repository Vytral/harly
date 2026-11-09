import { describe, expect, it } from "vitest";
import { authErrorKey } from "./error-keys";

describe("authErrorKey", () => {
  it("maps known Better Auth codes", () => {
    expect(authErrorKey("INVALID_EMAIL", "generic")).toBe("invalidEmail");
    expect(authErrorKey("USER_ALREADY_EXISTS", "generic")).toBe("accountExists");
    expect(authErrorKey("INVALID_CODE", "generic")).toBe("invalidCode");
  });
  it("uses the caller's fallback for unknown and missing codes", () => {
    expect(authErrorKey("DATABASE_FAILURE", "generic")).toBe("generic");
    expect(authErrorKey(undefined, "resetFailed")).toBe("resetFailed");
  });
});
