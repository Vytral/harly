import { readFileSync } from "node:fs";
import path from "node:path";

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { jobStages } from "@harly/db";
import {
  DEFAULT_PIPELINE_STAGES,
  LEGACY_STAGE_NAME_KINDS,
  STAGE_KINDS,
  activeStages,
  applicationStatusForStage,
  applicationStatusForStageKind,
  defaultStageRows,
  effectiveStageKind,
  effectiveStageKindSql,
  entryStage,
  findStageByKind,
  inferStageKindFromName,
  isStageKind,
  isTerminalStageKind,
  stageIsAnyKindSql,
  validatePipelineShape,
} from "@harly/db/stage-kind";

const stage = (
  id: string,
  name: string,
  order: number,
  extra: { kind?: (typeof STAGE_KINDS)[number] | null; archivedAt?: Date | null } = {},
) => ({ id, name, order, ...extra });

describe("stage kind inference", () => {
  it("maps legacy default names regardless of case and padding", () => {
    expect(inferStageKindFromName("Hired")).toBe("hired");
    expect(inferStageKindFromName("  rEjEcTeD ")).toBe("rejected");
    expect(inferStageKindFromName("WITHDRAWN")).toBe("withdrawn");
    expect(inferStageKindFromName("Offer")).toBe("offer");
  });

  it("ignores tabs, newlines and no-break spaces around a name, like the SQL helper does", () => {
    for (const padded of ["Hired\t", "\tHired\n", "\u00a0Hired\u00a0", " \r\f\vHired "]) {
      expect(inferStageKindFromName(padded)).toBe("hired");
    }
    // Only the ends are trimmed, and only the documented characters.
    expect(inferStageKindFromName("Hi\tred")).toBe("custom");
    expect(inferStageKindFromName("Hired\u200b")).toBe("custom");
  });

  it("treats unknown names as custom", () => {
    expect(inferStageKindFromName("Phone screen")).toBe("custom");
    expect(inferStageKindFromName("Hired (pending)")).toBe("custom");
  });

  it("prefers the stored kind over the name", () => {
    expect(effectiveStageKind({ kind: "hired", name: "Joined" })).toBe("hired");
    expect(effectiveStageKind({ kind: "custom", name: "Hired" })).toBe("custom");
    expect(effectiveStageKind({ kind: null, name: "Hired" })).toBe("hired");
    expect(effectiveStageKind({ name: "Interview" })).toBe("interview");
  });

  it("recognises valid kinds", () => {
    for (const kind of STAGE_KINDS) expect(isStageKind(kind)).toBe(true);
    expect(isStageKind("Hired")).toBe(false);
    expect(isStageKind(null)).toBe(false);
  });
});

describe("terminal semantics", () => {
  it("only hired, rejected and withdrawn are terminal", () => {
    const terminal = STAGE_KINDS.filter(isTerminalStageKind);
    expect(terminal).toEqual(["hired", "rejected", "withdrawn"]);
  });

  it("derives application status from the stage kind, not its name", () => {
    expect(applicationStatusForStageKind("offer")).toBe("active");
    expect(applicationStatusForStageKind("hired")).toBe("hired");
    expect(applicationStatusForStage({ kind: "rejected", name: "Not a fit" })).toBe(
      "rejected",
    );
    expect(applicationStatusForStage({ kind: "custom", name: "Hired" })).toBe("active");
  });
});

describe("pipeline helpers", () => {
  const stages = [
    stage("c", "Hired", 3, { kind: "hired" }),
    stage("a", "Applied", 0, { kind: "applied" }),
    stage("old", "Old", 1, { kind: "custom", archivedAt: new Date() }),
    stage("b", "Interview", 2, { kind: "interview" }),
  ];

  it("returns active stages in board order", () => {
    expect(activeStages(stages).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("finds a stage by kind and ignores archived ones", () => {
    expect(findStageByKind(stages, "hired")?.id).toBe("c");
    expect(findStageByKind(stages, "custom")).toBeNull();
  });

  it("lands new applications in the first active non-terminal stage", () => {
    expect(entryStage(stages)?.id).toBe("a");
    expect(
      entryStage([stage("h", "Hired", 0, { kind: "hired" }), stage("x", "Intake", 1)])
        ?.id,
    ).toBe("x");
    expect(entryStage([stage("h", "Hired", 0, { kind: "hired" })])).toBeNull();
  });

  it("reports pipeline shape violations", () => {
    expect(validatePipelineShape([stage("h", "Hired", 0, { kind: "hired" })])).toEqual([
      { code: "no_active_stage" },
    ]);
    expect(
      validatePipelineShape([
        stage("a", "Applied", 0, { kind: "applied" }),
        stage("b", " applied ", 1, { kind: "custom" }),
      ]),
    ).toEqual([{ code: "duplicate_name", name: "applied" }]);
    expect(
      validatePipelineShape([
        stage("a", "Applied", 0, { kind: "applied" }),
        stage("b", "Applied", 1, { kind: "custom", archivedAt: new Date() }),
      ]),
    ).toEqual([]);
    expect(
      validatePipelineShape([stage("a", "   ", 0, { kind: "applied" })]),
    ).toContainEqual({ code: "empty_name" });
  });
});

describe("default pipeline", () => {
  it("has one stage per default kind with unique names and ordered rows", () => {
    expect(DEFAULT_PIPELINE_STAGES.map((s) => s.kind)).toEqual([
      "applied",
      "screening",
      "interview",
      "offer",
      "hired",
      "rejected",
    ]);
    const rows = defaultStageRows({ workspaceId: "w", jobId: "j" });
    expect(rows.map((r) => r.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(validatePipelineShape(rows)).toEqual([]);
  });

  it("keeps names consistent with legacy inference", () => {
    for (const s of DEFAULT_PIPELINE_STAGES) {
      expect(inferStageKindFromName(s.name)).toBe(s.kind);
    }
  });
});

describe("SQL helpers", () => {
  const dialect = new PgDialect();

  it("renders a coalesce over the stored kind with a legacy name fallback", () => {
    const { sql: text, params } = dialect.sqlToQuery(
      effectiveStageKindSql(jobStages),
    );
    expect(text).toContain("coalesce");
    expect(text).toContain('"job_stages"."kind"');
    expect(text).toContain("lower(btrim(");
    expect(params).toEqual(
      expect.arrayContaining(Object.keys(LEGACY_STAGE_NAME_KINDS)),
    );
  });

  it("builds an in-list predicate", () => {
    const { sql: text, params } = dialect.sqlToQuery(
      stageIsAnyKindSql(jobStages, ["offer", "hired"]),
    );
    expect(text).toContain(" in (");
    expect(params.slice(-2)).toEqual(["offer", "hired"]);
  });
});

describe("migration 0154 stays in sync with the legacy mapping", () => {
  const migration = readFileSync(
    path.resolve(
      __dirname,
      "../../../../../packages/db/migrations/0154_backfill_job_stage_kind.sql",
    ),
    "utf8",
  );

  it("maps every legacy name to the same kind", () => {
    for (const [name, kind] of Object.entries(LEGACY_STAGE_NAME_KINDS)) {
      expect(migration).toContain(`WHEN '${name}' THEN '${kind}'::"job_stage_kind"`);
    }
    expect(migration).toContain(`ELSE 'custom'::"job_stage_kind"`);
  });
});
