import { describe, expect, it } from "vitest";

import {
  constantTimeEqual,
  generateOpaqueToken,
  isValidCodeChallenge,
  isValidCodeVerifier,
  pkceS256Challenge,
  sha256Hex,
  verifyPkceS256,
} from "./crypto";

// RFC 7636 appendix B test vector.
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("PKCE S256", () => {
  it("derives the RFC 7636 challenge", () => {
    expect(pkceS256Challenge(VERIFIER)).toBe(CHALLENGE);
    expect(verifyPkceS256(VERIFIER, CHALLENGE)).toBe(true);
  });

  it("rejects a wrong verifier, a plain challenge and malformed verifiers", () => {
    expect(verifyPkceS256(VERIFIER.replace("d", "e"), CHALLENGE)).toBe(false);
    // "plain" method would send the verifier itself as the challenge.
    expect(verifyPkceS256(VERIFIER, VERIFIER)).toBe(false);
    expect(verifyPkceS256("short", pkceS256Challenge("short"))).toBe(false);
    expect(isValidCodeVerifier("a".repeat(129))).toBe(false);
    expect(isValidCodeVerifier(`${"a".repeat(42)}!`)).toBe(false);
  });

  it("validates challenge shape", () => {
    expect(isValidCodeChallenge(CHALLENGE)).toBe(true);
    expect(isValidCodeChallenge("abc")).toBe(false);
    expect(isValidCodeChallenge(`${CHALLENGE}=`)).toBe(false);
  });
});

describe("token primitives", () => {
  it("generates prefixed, unique, high-entropy tokens", () => {
    const a = generateOpaqueToken("hmat_");
    const b = generateOpaqueToken("hmat_");
    expect(a.startsWith("hmat_")).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(5 + 43);
  });

  it("hashes to a stable 64-char hex digest", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("compares in constant time and handles length mismatch", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "diff")).toBe(false);
    expect(constantTimeEqual("short", "longer-value")).toBe(false);
  });
});
