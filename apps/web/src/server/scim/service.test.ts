import { describe, expect, it } from "vitest";
import {
  createScimTokenValue,
  hashScimToken,
  parseScimBoolean,
  parseScimFilter,
  ScimError,
} from "./service";

describe("SCIM credentials", () => {
  it("creates high-entropy, non-reversible bearer values", () => {
    const first = createScimTokenValue();
    const second = createScimTokenValue();
    expect(first.raw).toMatch(/^harly_scim_[A-Za-z0-9_-]{40,}$/);
    expect(first.raw).not.toBe(second.raw);
    expect(first.hash).toBe(hashScimToken(first.raw));
    expect(first.hash).not.toContain(first.raw);
    expect(first.prefix).toBe(first.raw.slice(0, 18));
  });
});

describe("parseScimFilter", () => {
  it("parses userName and externalId equality, case-insensitively on the keyword", () => {
    expect(parseScimFilter('userName eq "a@example.test"')).toEqual({
      attribute: "userName",
      value: "a@example.test",
    });
    expect(parseScimFilter('EXTERNALID EQ "ext-1"')).toEqual({
      attribute: "externalId",
      value: "ext-1",
    });
    expect(parseScimFilter(undefined)).toBeNull();
  });

  it("keeps wildcard characters literal and rejects unsupported filters", () => {
    expect(parseScimFilter('userName eq "%@example.test"')).toEqual({
      attribute: "userName",
      value: "%@example.test",
    });
    for (const bad of [
      'userName co "a"',
      'active eq "true"',
      'userName eq "a" and externalId eq "b"',
      "userName eq a",
    ]) {
      expect(() => parseScimFilter(bad)).toThrow(ScimError);
    }
    try {
      parseScimFilter('userName sw "a"');
    } catch (error) {
      expect((error as ScimError).scimType).toBe("invalidFilter");
      expect((error as ScimError).status).toBe(400);
    }
  });
});

describe("parseScimBoolean", () => {
  it("accepts booleans and True/False strings", () => {
    expect(parseScimBoolean(true)).toBe(true);
    expect(parseScimBoolean("False")).toBe(false);
    expect(parseScimBoolean("True")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(() => parseScimBoolean("yes")).toThrow(ScimError);
    expect(() => parseScimBoolean(undefined)).toThrow(ScimError);
  });
});
