import { describe, expect, it } from "vitest";

import {
  buildCandidateImportRows,
  prepareCandidateImport,
  validateCandidateImportMapping,
} from "./candidate-import";

describe("prepareCandidateImport", () => {
  it("accepts UTF-8 BOM and semicolon-separated exports", () => {
    expect(prepareCandidateImport("\ufeffFull name;Email\nAda Lovelace;ada@example.com")).toMatchObject({
      headers: ["Full name", "Email"],
      dataRows: [["Ada Lovelace", "ada@example.com"]],
      delimiter: ";",
    });
  });

  it("rejects duplicate headers before a user can map the file", () => {
    expect(prepareCandidateImport("Email,email\na@example.com,b@example.com")).toEqual({
      error: 'The header "email" is repeated. Rename duplicate columns and try again.',
    });
  });
});

describe("buildCandidateImportRows", () => {
  it("splits a Full name export into the required candidate names and preserves source row numbers", () => {
    const result = buildCandidateImportRows({
      dataRows: [["Ada Lovelace", "ada@example.com"]],
      mapping: { fullName: 0, email: 1 },
    });

    expect(result).toEqual([
      {
        rowNumber: 2,
        values: {
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          phone: "",
          location: "",
          linkedinUrl: "",
          githubUrl: "",
          websiteUrl: "",
          headline: "",
        },
      },
    ]);
  });
});

describe("validateCandidateImportMapping", () => {
  it("requires either full name or both name columns, and never permits one column twice", () => {
    expect(validateCandidateImportMapping({ email: 1 })).toBe(
      "Map Full name, or both First name and Last name.",
    );
    expect(validateCandidateImportMapping({ fullName: 0, email: 0 })).toBe(
      "Each source column can only be mapped once.",
    );
  });
});
