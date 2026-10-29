import { describe, expect, it } from "vitest";

// The seed guard is a pure function owned by the db package, next to the wipe
// it protects. The CLI and this test share it, so the rules cannot drift apart.
import {
  countWipeGuardRecords,
  evaluateSeedWipeGuard,
  UNPINNED_WIPE_RECORD_LIMIT,
  WIPE_GUARD_STRUCTURAL_TABLES,
  type SeedWipeGuardInput,
} from "../../../../../packages/db/src/seed-demo-workspace";

const WORKSPACE = {
  workspaceId: "org_demo_123",
  workspaceSlug: "acme-hiring",
  workspaceName: "Acme Hiring",
};

function guard(overrides: Partial<SeedWipeGuardInput> = {}) {
  return evaluateSeedWipeGuard({
    ...WORKSPACE,
    confirmation: null,
    pinnedWorkspaceId: null,
    realRecordCount: 0,
    ...overrides,
  });
}

describe("evaluateSeedWipeGuard", () => {
  it("refuses when no confirmation is given, and names the slug to type", () => {
    const decision = guard();
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("missing_confirmation");
    expect(decision.message).toContain("SEED_CONFIRM_WIPE=acme-hiring");
    expect(decision.message).toContain("Acme Hiring");
  });

  it("treats a blank confirmation the same as none", () => {
    expect(guard({ confirmation: "   " }).allowed).toBe(false);
    expect(guard({ confirmation: "" }).allowed).toBe(false);
  });

  it("refuses a confirmation that names a different workspace", () => {
    const decision = guard({ confirmation: "syntrix" });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("confirmation_mismatch");
  });

  it("requires an exact slug match, not a case-insensitive or id match", () => {
    expect(guard({ confirmation: "ACME-HIRING" }).allowed).toBe(false);
    expect(guard({ confirmation: WORKSPACE.workspaceId }).allowed).toBe(false);
  });

  it("accepts the matching slug, surrounding whitespace ignored", () => {
    expect(guard({ confirmation: "acme-hiring" })).toEqual({ allowed: true });
    expect(guard({ confirmation: "  acme-hiring  " })).toEqual({ allowed: true });
  });

  it("refuses an unpinned workspace over the record limit, even when confirmed", () => {
    const decision = guard({
      confirmation: "acme-hiring",
      realRecordCount: UNPINNED_WIPE_RECORD_LIMIT + 1,
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("unpinned_workspace_has_records");
    expect(decision.message).toContain(
      `DEMO_WORKSPACE_ID=${WORKSPACE.workspaceId}`,
    );
  });

  it("accepts an unpinned workspace exactly at the record limit", () => {
    expect(
      guard({
        confirmation: "acme-hiring",
        realRecordCount: UNPINNED_WIPE_RECORD_LIMIT,
      }),
    ).toEqual({ allowed: true });
  });

  it("accepts a pinned workspace regardless of its record count", () => {
    expect(
      guard({
        confirmation: "acme-hiring",
        pinnedWorkspaceId: WORKSPACE.workspaceId,
        realRecordCount: 10_000,
      }),
    ).toEqual({ allowed: true });
  });

  it("refuses when the pin names a different workspace", () => {
    const decision = guard({
      confirmation: "acme-hiring",
      pinnedWorkspaceId: "org_other",
      realRecordCount: 0,
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("pin_mismatch");
  });

  it("counts real-looking records against the limit only once confirmed", () => {
    // Without confirmation the missing-confirmation reason wins, so the operator
    // sees the first thing to fix rather than a record-count message.
    const decision = guard({ realRecordCount: 500 });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("missing_confirmation");
  });
});

describe("countWipeGuardRecords", () => {
  it("sums every record table, not only candidates, jobs and applications", () => {
    const rows = [
      { table: "candidates", rows: 8 },
      { table: "jobs", rows: 6 },
      { table: "applications", rows: 6 },
      { table: "offers", rows: 3 },
      { table: "interviews", rows: 3 },
    ];
    expect(countWipeGuardRecords(rows)).toBe(26);
  });

  it("does not count structural rows such as settings, roles and stage definitions", () => {
    const rows = [
      { table: "workspace_settings", rows: 1 },
      { table: "custom_roles", rows: 2 },
      { table: "job_stages", rows: 6 },
      { table: "setup_checklist_states", rows: 1 },
      { table: "sample_data_items", rows: 9 },
    ];
    expect(countWipeGuardRecords(rows)).toBe(0);
  });

  it("names the structural tables it leaves out", () => {
    expect(WIPE_GUARD_STRUCTURAL_TABLES).toEqual(
      expect.arrayContaining(["workspace_settings", "custom_roles", "job_stages"]),
    );
    expect(WIPE_GUARD_STRUCTURAL_TABLES).not.toContain("candidates");
    expect(WIPE_GUARD_STRUCTURAL_TABLES).not.toContain("applications");
  });
});

describe("evaluateSeedWipeGuard with every record table counted", () => {
  it("refuses an unpinned workspace whose records are spread across many tables", () => {
    // Twenty candidates, jobs and applications on their own passed the old guard.
    const records = countWipeGuardRecords([
      { table: "candidates", rows: 8 },
      { table: "jobs", rows: 6 },
      { table: "applications", rows: 6 },
      { table: "offers", rows: 3 },
      { table: "interviews", rows: 3 },
    ]);
    const decision = guard({ confirmation: "acme-hiring", realRecordCount: records });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("unpinned_workspace_has_records");
  });

  it("allows a workspace that holds only configuration", () => {
    const records = countWipeGuardRecords([
      { table: "workspace_settings", rows: 1 },
      { table: "job_stages", rows: 6 },
    ]);
    expect(guard({ confirmation: "acme-hiring", realRecordCount: records }).allowed).toBe(true);
  });

  it("keeps the limit at exactly 25 records", () => {
    expect(UNPINNED_WIPE_RECORD_LIMIT).toBe(25);
    expect(guard({ confirmation: "acme-hiring", realRecordCount: 25 }).allowed).toBe(true);
    expect(guard({ confirmation: "acme-hiring", realRecordCount: 26 }).allowed).toBe(false);
  });
});
