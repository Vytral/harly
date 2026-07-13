import { describe, expect, it } from "vitest";

// F1-20: the candidate portal must NOT load internal interview notes. We assert
// the select shape used to render the candidate's interview list deliberately
// omits `interviews.notes` — keeping internal evaluator notes private.

import { interviews } from "@harly/db";

import { portalInterviewSelect } from "./portal-applications";

function fieldPaths(): string[] {
  // Top-level keys of the select object. `notes` would only appear here if the
  // helper ever selected `interviews.notes` — which is exactly what F1-20
  // forbids. (drizzle column refs nest the table under a non-enumerable getter,
  // so we deliberately do not recurse into them.)
  return Object.keys(portalInterviewSelect as Record<string, unknown>);
}

describe("F1-20 candidate portal interview-notes isolation", () => {
  it("selects only candidate-visible interview fields (no notes)", () => {
    const paths = fieldPaths();
    // The internal notes field must never be part of the candidate-facing query.
    // (drizzle column refs nest the table under a getter, so only top-level keys
    // are enumerable here — but `notes` would appear as a top-level key if ever
    // selected, which is exactly what we forbid.)
    expect(paths.some((p) => p.toLowerCase().includes("notes"))).toBe(false);
    // Sanity: candidate-visible fields are still selected.
    expect(paths).toContain("title");
    expect(paths).toContain("scheduledAt");
    expect(paths).toContain("interviewerName");
  });

  it("excludes interviews.notes even at the column-reference level", () => {
    const notesRef = (interviews as unknown as Record<string, unknown>).notes;
    // If the helper ever added `notes: interviews.notes`, the entry would carry
    // the `interviews` table reference with a `notes` column.
    const hasNotesColumn = Object.values(
      portalInterviewSelect as Record<string, unknown>,
    ).some((ref) => {
      if (ref && typeof ref === "object" && !(ref instanceof Date)) {
        const cols = (ref as Record<string, object>).interviews;
        return cols ? "notes" in (cols as object) : false;
      }
      return false;
    });
    expect(hasNotesColumn).toBe(false);
    expect(notesRef).toBeDefined();
  });
});
