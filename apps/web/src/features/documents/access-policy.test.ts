import { describe, expect, it } from "vitest";

import { documentAccessIsExplicit, resolveDocumentAccessLevel } from "./access-policy";

describe("document access policy", () => {
  it("gives a matching explicit member rule precedence over a role rule", () => {
    expect(
      resolveDocumentAccessLevel({
        ownerId: "owner-1",
        userId: "reviewer-1",
        roleKey: "recruiter",
        memberRules: [{ userId: "reviewer-1", accessLevel: "read" }],
        roleRules: [{ roleKey: "recruiter", accessLevel: "manage" }],
      }),
    ).toBe("read");
  });

  it("denies access when an explicit ACL exists for another user", () => {
    expect(
      resolveDocumentAccessLevel({
        ownerId: "owner-1",
        userId: "reviewer-1",
        roleKey: "recruiter",
        memberRules: [{ userId: "reviewer-2", accessLevel: "manage" }],
        roleRules: [],
      }),
    ).toBeNull();
  });

  it("allows workspace owners to manage every document", () => {
    expect(
      resolveDocumentAccessLevel({
        ownerId: "owner-1",
        userId: "workspace-owner",
        roleKey: "owner",
        memberRules: [{ userId: "reviewer-1", accessLevel: "read" }],
        roleRules: [{ roleKey: "owner", accessLevel: "read" }],
      }),
    ).toBe("manage");
  });

  it("applies a matching role rule when no member rule overrides it", () => {
    expect(
      resolveDocumentAccessLevel({
        ownerId: null,
        userId: "reviewer-1",
        roleKey: "recruiter",
        memberRules: [],
        roleRules: [{ roleKey: "recruiter", accessLevel: "manage" }],
      }),
    ).toBe("manage");
  });

  it("defaults to read access only when the document has no explicit ACL", () => {
    expect(
      resolveDocumentAccessLevel({
        ownerId: null,
        userId: "reviewer-1",
        roleKey: "recruiter",
        memberRules: [],
        roleRules: [],
      }),
    ).toBe("read");
  });
});

describe("documentAccessIsExplicit", () => {
  const base = { ownerId: "owner-1", userId: "reviewer-1", roleKey: "recruiter", memberRules: [], roleRules: [] };

  it("is not explicit for a viewer with only the workspace-wide default", () => {
    expect(documentAccessIsExplicit(base)).toBe(false);
  });

  it("is explicit for the owner, an admin, and the owner role", () => {
    expect(documentAccessIsExplicit({ ...base, ownerId: "reviewer-1" })).toBe(true);
    expect(documentAccessIsExplicit({ ...base, roleKey: "admin" })).toBe(true);
    expect(documentAccessIsExplicit({ ...base, roleKey: "owner" })).toBe(true);
  });

  it("is explicit when a member or role rule names the viewer", () => {
    expect(documentAccessIsExplicit({ ...base, memberRules: [{ userId: "reviewer-1" }] })).toBe(true);
    expect(documentAccessIsExplicit({ ...base, roleRules: [{ roleKey: "recruiter" }] })).toBe(true);
  });

  it("is not explicit when rules exist but none names the viewer", () => {
    expect(
      documentAccessIsExplicit({
        ...base,
        memberRules: [{ userId: "someone-else" }],
        roleRules: [{ roleKey: "manager" }],
      }),
    ).toBe(false);
  });
});
