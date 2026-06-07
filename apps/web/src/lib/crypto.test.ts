import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, isEncryptionConfigured } from "./crypto";

// Deterministic 32-byte key for tests.
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

describe("crypto", () => {
  const previous = process.env.AI_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.AI_ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    process.env.AI_ENCRYPTION_KEY = previous;
  });

  it("round-trips a secret", () => {
    const secret = "sk-test-1234567890";
    const encrypted = encryptSecret(secret);
    expect(encrypted.ciphertext).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it("produces a unique IV per encryption", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails to decrypt a tampered ciphertext", () => {
    const encrypted = encryptSecret("secret");
    expect(() =>
      decryptSecret({ ...encrypted, tag: Buffer.alloc(16, 0).toString("base64") }),
    ).toThrow();
  });

  it("reports configured state", () => {
    expect(isEncryptionConfigured()).toBe(true);
  });
});
