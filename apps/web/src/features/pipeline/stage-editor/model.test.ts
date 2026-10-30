import { describe, expect, it } from "vitest";

import {
  activeStagesOf,
  archivedStagesOf,
  canStep,
  checkStageName,
  countLabel,
  decideKindChange,
  describeShapeIssue,
  insertionRange,
  kindLockNote,
  mergeMessage,
  normalizeEmailConfig,
  planArchive,
  planMove,
  positionOptions,
  reorderAnnouncement,
  sameStageState,
  toEditorStage,
  validMergeTargets,
  type EditorStage,
} from "./model";

let counter = 0;

function stage(overrides: Partial<EditorStage> & Pick<EditorStage, "name" | "kind">): EditorStage {
  counter += 1;
  return {
    id: overrides.id ?? `stage-${counter}`,
    color: null,
    order: counter - 1,
    archivedAt: null,
    applicationCount: 0,
    emailConfig: { candidateUpdatesEnabled: true },
    ...overrides,
  };
}

/** The default pipeline shape: six stages, three active then the outcomes. */
function defaultPipeline(): EditorStage[] {
  return [
    stage({ id: "applied", name: "Applied", kind: "applied", order: 0 }),
    stage({ id: "screening", name: "Screening", kind: "screening", order: 1 }),
    stage({ id: "interview", name: "Interview", kind: "interview", order: 2 }),
    stage({ id: "offer", name: "Offer", kind: "offer", order: 3 }),
    stage({ id: "hired", name: "Hired", kind: "hired", order: 4 }),
    stage({ id: "rejected", name: "Rejected", kind: "rejected", order: 5 }),
  ];
}

describe("activeStagesOf and archivedStagesOf", () => {
  it("returns active stages in board order and archived ones newest first", () => {
    const stages = [
      stage({ id: "b", name: "B", kind: "custom", order: 2 }),
      stage({ id: "a", name: "A", kind: "custom", order: 0 }),
      stage({
        id: "old",
        name: "Old",
        kind: "custom",
        order: 1,
        archivedAt: new Date("2026-01-01T00:00:00Z"),
      }),
      stage({
        id: "new",
        name: "New",
        kind: "custom",
        order: 3,
        archivedAt: new Date("2026-03-01T00:00:00Z"),
      }),
    ];
    expect(activeStagesOf(stages).map((s) => s.id)).toEqual(["a", "b"]);
    expect(archivedStagesOf(stages).map((s) => s.id)).toEqual(["new", "old"]);
  });
});

describe("checkStageName", () => {
  const active = defaultPipeline();

  it("rejects an empty or whitespace-only name", () => {
    expect(checkStageName("   ", active)).toEqual({ ok: false, error: "Enter a stage name." });
  });

  it("normalizes whitespace in accepted names", () => {
    expect(checkStageName("  Technical   test ", active)).toEqual({
      ok: true,
      name: "Technical test",
    });
  });

  it("rejects names longer than 120 characters", () => {
    const result = checkStageName("x".repeat(121), active);
    expect(result.ok).toBe(false);
  });

  it("treats names as unique among active stages, ignoring case", () => {
    const result = checkStageName("  INTERVIEW ", active);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain('"Interview"');
  });

  it("lets a stage keep its own name when it is renamed", () => {
    expect(checkStageName("interview", active, "interview")).toEqual({
      ok: true,
      name: "interview",
    });
  });

  it("ignores archived stages when checking for clashes", () => {
    const withArchived = [
      ...active,
      stage({ id: "gone", name: "Take-home", kind: "custom", archivedAt: new Date() }),
    ];
    expect(checkStageName("take-home", withArchived).ok).toBe(true);
  });
});

describe("validMergeTargets", () => {
  it("lets an active stage merge into any other active non-outcome stage", () => {
    const stages = defaultPipeline();
    const targets = validMergeTargets(stages[1], stages).map((s) => s.id);
    expect(targets).toEqual(["applied", "interview", "offer"]);
  });

  it("lets an outcome merge only into the same outcome", () => {
    const stages = [
      ...defaultPipeline(),
      stage({ id: "hired2", name: "Hired (EU)", kind: "hired" }),
    ];
    expect(validMergeTargets(stages[4], stages).map((s) => s.id)).toEqual(["hired2"]);
    expect(validMergeTargets(stages[5], stages)).toEqual([]);
  });

  it("never offers archived stages or the source itself", () => {
    const stages = [
      ...defaultPipeline(),
      stage({ id: "archived", name: "Old", kind: "screening", archivedAt: new Date() }),
    ];
    const ids = validMergeTargets(stages[1], stages).map((s) => s.id);
    expect(ids).not.toContain("archived");
    expect(ids).not.toContain("screening");
  });
});

describe("planArchive", () => {
  it("asks for a plain confirm when the stage holds no candidates", () => {
    const stages = defaultPipeline();
    expect(planArchive(stages[1], stages)).toEqual({ mode: "confirm" });
  });

  it("requires a merge target, defaulting to the first valid one, when candidates are present", () => {
    const stages = defaultPipeline();
    stages[1] = { ...stages[1], applicationCount: 12 };
    const plan = planArchive(stages[1], stages);
    expect(plan).toMatchObject({ mode: "merge", defaultTargetId: "applied" });
    if (plan.mode === "merge") {
      expect(plan.targets.map((s) => s.id)).toEqual(["applied", "interview", "offer"]);
    }
  });

  it("blocks archiving an outcome that has candidates and no other stage of its kind", () => {
    const stages = defaultPipeline();
    stages[4] = { ...stages[4], applicationCount: 3 };
    const plan = planArchive(stages[4], stages);
    expect(plan.mode).toBe("blocked");
    if (plan.mode === "blocked") {
      expect(plan.reason).toContain("3 candidates");
      expect(plan.reason).toContain("Hired");
    }
  });

  it("blocks archiving the only active non-outcome stage when no candidates would move", () => {
    const stages = [
      stage({ id: "only", name: "Only", kind: "custom", order: 0 }),
      stage({ id: "hired", name: "Hired", kind: "hired", order: 1 }),
    ];
    const plan = planArchive(stages[0], stages);
    expect(plan).toEqual({
      mode: "blocked",
      reason: describeShapeIssue({ code: "no_active_stage" }),
    });
  });

  it("blocks a non-outcome stage with candidates when no other active stage exists", () => {
    const stages = [
      stage({ id: "only", name: "Only", kind: "custom", order: 0, applicationCount: 2 }),
      stage({ id: "hired", name: "Hired", kind: "hired", order: 1 }),
    ];
    const plan = planArchive(stages[0], stages);
    expect(plan.mode).toBe("blocked");
  });
});

describe("mergeMessage and countLabel", () => {
  it("states how many candidates move and that history is kept", () => {
    expect(mergeMessage(12, "Screening")).toBe(
      "12 candidates will move to Screening. History is kept.",
    );
  });

  it("uses the singular for one candidate", () => {
    expect(mergeMessage(1, "Screening")).toBe("1 candidate will move to Screening. History is kept.");
    expect(countLabel(1)).toBe("1 candidate");
    expect(countLabel(0)).toBe("0 candidates");
  });
});

describe("decideKindChange", () => {
  it("allows keeping the same kind", () => {
    const stages = defaultPipeline();
    expect(decideKindChange({ stage: stages[1], stages, nextKind: "screening" })).toEqual({
      allowed: true,
    });
  });

  it("allows moving between active kinds even with candidates in the stage", () => {
    const stages = defaultPipeline();
    stages[1] = { ...stages[1], applicationCount: 4 };
    expect(decideKindChange({ stage: stages[1], stages, nextKind: "interview" })).toEqual({
      allowed: true,
    });
  });

  it("refuses to turn a stage with candidates into an outcome", () => {
    const stages = defaultPipeline();
    stages[2] = { ...stages[2], applicationCount: 2 };
    const decision = decideKindChange({ stage: stages[2], stages, nextKind: "rejected" });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain("2 candidates");
  });

  it("refuses to move candidates out of an outcome by changing its kind", () => {
    const stages = defaultPipeline();
    stages[4] = { ...stages[4], applicationCount: 1 };
    expect(decideKindChange({ stage: stages[4], stages, nextKind: "custom" }).allowed).toBe(false);
  });

  it("allows an empty stage to become an outcome when another active stage remains", () => {
    const stages = defaultPipeline();
    expect(decideKindChange({ stage: stages[3], stages, nextKind: "hired" })).toEqual({
      allowed: true,
    });
  });

  it("refuses the change that would leave no active entry stage", () => {
    const stages = [
      stage({ id: "only", name: "Only", kind: "custom", order: 0 }),
      stage({ id: "hired", name: "Hired", kind: "hired", order: 1 }),
    ];
    const decision = decideKindChange({ stage: stages[0], stages, nextKind: "rejected" });
    expect(decision).toEqual({
      allowed: false,
      reason: describeShapeIssue({ code: "no_active_stage" }),
    });
  });
});

describe("kindLockNote", () => {
  it("is empty when the stage holds no candidates", () => {
    expect(kindLockNote(stage({ name: "A", kind: "screening" }))).toBeNull();
  });

  it("explains the lock for a populated active stage and for a populated outcome", () => {
    const active = kindLockNote(stage({ name: "A", kind: "screening", applicationCount: 1 }));
    const outcome = kindLockNote(stage({ name: "H", kind: "hired", applicationCount: 1 }));
    expect(active).toContain("locked while candidates are here");
    expect(outcome).toContain("Archive the stage");
  });
});

describe("planMove and canStep", () => {
  it("returns the full new order of active stages", () => {
    const stages = defaultPipeline();
    expect(planMove(stages, "interview", 0)).toEqual([
      "interview",
      "applied",
      "screening",
      "offer",
      "hired",
      "rejected",
    ]);
    expect(planMove(stages, "applied", 2)).toEqual([
      "screening",
      "interview",
      "applied",
      "offer",
      "hired",
      "rejected",
    ]);
  });

  it("refuses to move an active stage past the outcome boundary", () => {
    const stages = defaultPipeline();
    expect(planMove(stages, "offer", 4)).toBeNull();
    expect(planMove(stages, "applied", 4)).toBeNull();
  });

  it("refuses to move an outcome above active stages", () => {
    const stages = defaultPipeline();
    expect(planMove(stages, "hired", 3)).toBeNull();
  });

  it("allows an outcome to move within the outcome block", () => {
    const stages = defaultPipeline();
    expect(planMove(stages, "hired", 5)).toEqual([
      "applied",
      "screening",
      "interview",
      "offer",
      "rejected",
      "hired",
    ]);
  });

  it("returns null for a no-op or an unknown stage", () => {
    const stages = defaultPipeline();
    expect(planMove(stages, "screening", 1)).toBeNull();
    expect(planMove(stages, "missing", 0)).toBeNull();
  });

  it("ignores archived stages when computing positions", () => {
    const stages = [
      stage({ id: "a", name: "A", kind: "custom", order: 0 }),
      stage({ id: "gone", name: "Gone", kind: "custom", order: 1, archivedAt: new Date() }),
      stage({ id: "b", name: "B", kind: "custom", order: 2 }),
    ];
    expect(planMove(stages, "b", 0)).toEqual(["b", "a"]);
  });

  it("reports whether a stage can step up or down", () => {
    const stages = defaultPipeline();
    expect(canStep(stages, "applied", -1)).toBe(false);
    expect(canStep(stages, "applied", 1)).toBe(true);
    expect(canStep(stages, "offer", 1)).toBe(false);
    expect(canStep(stages, "hired", 1)).toBe(true);
    expect(canStep(stages, "hired", -1)).toBe(false);
  });
});

describe("insertionRange and positionOptions", () => {
  it("defaults a new active stage to just before the first outcome", () => {
    const stages = defaultPipeline();
    const range = insertionRange(activeStagesOf(stages), "custom");
    expect(range).toEqual({ min: 0, max: 4, defaultIndex: 4 });
  });

  it("defaults a new outcome to the end", () => {
    const stages = defaultPipeline();
    const range = insertionRange(activeStagesOf(stages), "withdrawn");
    expect(range).toEqual({ min: 4, max: 6, defaultIndex: 6 });
  });

  it("labels each slot with the stage it goes before", () => {
    const stages = defaultPipeline();
    const { options, defaultValue } = positionOptions(stages, "custom");
    expect(defaultValue).toBe(4);
    expect(options.map((option) => option.label)).toEqual([
      "Before Applied",
      "Before Screening",
      "Before Interview",
      "Before Offer",
      "Before Hired",
    ]);
  });

  it("offers the end of the pipeline when there are no outcomes", () => {
    const stages = [stage({ id: "a", name: "A", kind: "custom", order: 0 })];
    const { options, defaultValue } = positionOptions(stages, "custom");
    expect(defaultValue).toBe(1);
    expect(options.at(-1)).toEqual({ value: 1, label: "At the end" });
  });
});

describe("reorderAnnouncement", () => {
  it("names the stage and its new position", () => {
    const stages = defaultPipeline();
    const ids = ["screening", "applied", "interview", "offer"];
    expect(reorderAnnouncement(stages, "screening", ids)).toBe(
      "Moved Screening to position 1 of 4.",
    );
  });
});

describe("sameStageState", () => {
  it("treats identical lists as the same pipeline", () => {
    const stages = defaultPipeline();
    expect(sameStageState(stages, stages.map((s) => ({ ...s })))).toBe(true);
  });

  it("detects a rename, an order change, a new candidate or a different length", () => {
    const stages = defaultPipeline();
    const renamed = stages.map((s) => (s.id === "applied" ? { ...s, name: "New" } : s));
    const moved = stages.map((s) => (s.id === "applied" ? { ...s, order: 2 } : s));
    const counted = stages.map((s) => (s.id === "applied" ? { ...s, applicationCount: 1 } : s));
    expect(sameStageState(stages, renamed)).toBe(false);
    expect(sameStageState(stages, moved)).toBe(false);
    expect(sameStageState(stages, counted)).toBe(false);
    expect(sameStageState(stages, stages.slice(1))).toBe(false);
  });

  it("detects a stage that was archived elsewhere", () => {
    const stages = defaultPipeline();
    const archived = stages.map((s) =>
      s.id === "rejected" ? { ...s, archivedAt: new Date("2026-02-02T00:00:00Z") } : s,
    );
    expect(sameStageState(stages, archived)).toBe(false);
  });
});

describe("email config normalization", () => {
  it("reads a stored boolean and defaults everything else to enabled", () => {
    expect(normalizeEmailConfig({ candidateUpdatesEnabled: false })).toEqual({
      candidateUpdatesEnabled: false,
    });
    expect(normalizeEmailConfig(null)).toEqual({ candidateUpdatesEnabled: true });
    expect(normalizeEmailConfig({ candidateUpdatesEnabled: "no" })).toEqual({
      candidateUpdatesEnabled: true,
    });
  });

  it("converts a server summary into the editor shape", () => {
    const converted = toEditorStage({
      id: "x",
      name: "X",
      color: null,
      kind: "custom",
      order: 0,
      archivedAt: null,
      applicationCount: 0,
      emailConfig: { candidateUpdatesEnabled: false },
    });
    expect(converted.emailConfig).toEqual({ candidateUpdatesEnabled: false });
  });
});
