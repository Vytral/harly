import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  generateLongCode,
  generateRecoveryCode,
  hashCode,
  hashPassword,
  hashRecoveryCode,
  normalizeRecoveryCode,
  safeEqual,
  validatePasswordPolicy,
  verifyAgainstDummy,
  verifyPassword,
} from "./portal-password";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterz", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("uses a fresh salt per hash and never stores the plaintext", async () => {
    const a = await hashPassword("same password 1");
    const b = await hashPassword("same password 1");
    expect(a).not.toEqual(b);
    expect(a).not.toContain("same password 1");
  });

  it("treats unicode-equivalent passwords as equal (NFKC)", async () => {
    const hash = await hashPassword("pässwörd-long-enough");
    expect(await verifyPassword("pässwörd-long-enough", hash)).toBe(true);
  });

  it("rejects malformed stored hashes without throwing", async () => {
    for (const bad of ["", "plain", "scrypt$1$2", "bcrypt$a$b$c$d$e", "scrypt$x$8$1$AA==$AA=="]) {
      expect(await verifyPassword("whatever-long", bad)).toBe(false);
    }
  });

  it("dummy verification always fails", async () => {
    expect(await verifyAgainstDummy("anything at all")).toBe(false);
  });
});

describe("password policy", () => {
  it("enforces length bounds", () => {
    expect(validatePasswordPolicy("a".repeat(PASSWORD_MIN_LENGTH - 1)).ok).toBe(false);
    expect(validatePasswordPolicy("abcdefghij").ok).toBe(true);
    expect(validatePasswordPolicy("a1".repeat(PASSWORD_MAX_LENGTH)).ok).toBe(false);
  });
  it("rejects the email and trivially repetitive passwords", () => {
    expect(validatePasswordPolicy("jane.doe@example.com", { email: "jane.doe@example.com" }).ok).toBe(false);
    expect(validatePasswordPolicy("aaaaaaaaaaaa").ok).toBe(false);
  });
});

describe("one-time codes", () => {
  it("generates high-entropy distinct long codes", () => {
    const codes = new Set(Array.from({ length: 200 }, generateLongCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c.length).toBeGreaterThanOrEqual(32);
  });

  it("formats recovery codes and normalises user input", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(normalizeRecoveryCode(code.toLowerCase().replace(/-/g, " "))).toBe(code.replace(/-/g, ""));
    expect(hashRecoveryCode(code.toLowerCase())).toBe(hashRecoveryCode(code));
  });

  it("hashes deterministically and never equals the input", () => {
    expect(hashCode("x")).toBe(hashCode("x"));
    expect(hashCode("x")).not.toBe("x");
    expect(hashRecoveryCode("AAAA-BBBB-CCCC-DDDD")).not.toBe(hashCode("AAAABBBBCCCCDDDD"));
  });

  it("compares secrets in constant time regardless of length", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
