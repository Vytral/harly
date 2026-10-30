import { describe, expect, it } from "vitest";

import {
  buildSpine,
  isApplicationOutcome,
  kindOf,
  outcomeForStage,
  outcomeLabel,
  outcomeTone,
  PORTAL_OUTCOME_LABELS,
  stageDisplayName,
  stageTone,
  type StageSource,
} from "@/lib/stage-visuals";

const canonical: StageSource[] = [
  { id: "1", name: "Applied", kind: "applied" },
  { id: "2", name: "Screening", kind: "screening" },
  { id: "3", name: "Interview", kind: "interview" },
  { id: "4", name: "Offer", kind: "offer" },
  { id: "5", name: "Hired", kind: "hired" },
];

describe("kindOf", () => {
  it("uses the stored kind when there is one, whatever the name says", () => {
    expect(kindOf({ name: "Offer", kind: "hired" })).toBe("hired");
    expect(kindOf({ name: "Hired", kind: "custom" })).toBe("custom");
  });

  it("falls back to the legacy name only for NULL-kind rows", () => {
    expect(kindOf({ name: "Hired", kind: null })).toBe("hired");
    expect(kindOf({ name: "  rejected ", kind: null })).toBe("rejected");
    expect(kindOf({ name: "Phone screen", kind: null })).toBe("custom");
  });
});

describe("stage display", () => {
  it("shows the stage name, and the kind label when the name is blank", () => {
    expect(stageDisplayName({ name: "  Panel review ", kind: "custom" })).toBe("Panel review");
    expect(stageDisplayName({ name: "   ", kind: "interview" })).toBe("Interview");
  });

  it("tones stages by kind, so custom and renamed stages get the neutral tone", () => {
    expect(stageTone("hired")).toBe("success");
    expect(stageTone("rejected")).toBe("danger");
    expect(stageTone("withdrawn")).toBe("quiet");
    expect(stageTone("offer")).toBe("progress");
    expect(stageTone("custom")).toBe("neutral");
  });
});

describe("outcomes and portal labels", () => {
  it("derives the application outcome from the stage kind", () => {
    expect(outcomeForStage({ name: "Hired", kind: "hired" })).toBe("hired");
    expect(outcomeForStage({ name: "Offer call", kind: "custom" })).toBe("active");
    expect(outcomeForStage({ name: "Hired", kind: null })).toBe("hired");
  });

  it("tones outcomes and labels them plainly", () => {
    expect(outcomeTone("active")).toBe("neutral");
    expect(outcomeTone("hired")).toBe("success");
    expect(outcomeTone("rejected")).toBe("danger");
    expect(outcomeLabel("withdrawn")).toBe("Withdrawn");
  });

  it("never shows Offer to a candidate whose application is hired", () => {
    expect(PORTAL_OUTCOME_LABELS.hired).toBe("Hired");
    expect(Object.values(PORTAL_OUTCOME_LABELS)).not.toContain("Offer");
  });

  it("only accepts real outcomes, not inherited object keys", () => {
    expect(isApplicationOutcome("hired")).toBe(true);
    expect(isApplicationOutcome("constructor")).toBe(false);
    expect(isApplicationOutcome(null)).toBe(false);
  });
});

describe("buildSpine", () => {
  it("fills the stages up to the current one, found by id", () => {
    const spine = buildSpine({
      current: { name: "Interview", kind: "interview" },
      currentId: "3",
      stages: canonical,
    });

    expect(spine.terminal).toBeNull();
    expect(spine.position).toBe(3);
    expect(spine.segments.map((segment) => segment.state)).toEqual([
      "done",
      "done",
      "current",
      "todo",
      "todo",
    ]);
  });

  it("places a custom stage that sits in the middle of the pipeline", () => {
    const withCustom: StageSource[] = [
      { id: "a", name: "Applied", kind: "applied" },
      { id: "b", name: "Panel review", kind: "custom" },
      { id: "c", name: "Hired", kind: "hired" },
    ];
    const spine = buildSpine({
      current: { name: "Panel review", kind: "custom" },
      currentId: "b",
      stages: withCustom,
    });

    expect(spine.position).toBe(2);
    expect(spine.label).toBe("Panel review");
    expect(spine.segments[1].isCurrent).toBe(true);
  });

  it("finds a custom stage by kind when it is not on the spine at all", () => {
    const spine = buildSpine({
      current: { name: "Phone screen", kind: "screening" },
      stages: canonical,
    });

    expect(spine.position).toBe(2);
    expect(spine.segments[1].state).toBe("current");
  });

  it("marks every segment hired for a hired stage, whatever it is named", () => {
    const spine = buildSpine({
      current: { name: "Offer", kind: "hired" },
      currentId: "4",
      stages: canonical,
    });

    expect(spine.terminal).toBe("hired");
    expect(spine.label).toBe("Hired");
    expect(spine.segments.every((segment) => segment.state === "hired")).toBe(true);
  });

  it("treats a NULL-kind rejected row as rejected and a withdrawn stage as quiet", () => {
    const rejected = buildSpine({
      current: { name: "rejected", kind: null },
      stages: canonical,
    });
    expect(rejected.terminal).toBe("rejected");
    expect(rejected.segments.every((segment) => segment.state === "rejected")).toBe(true);

    const withdrawn = buildSpine({
      current: { name: "Withdrawn", kind: "withdrawn" },
      stages: canonical,
    });
    expect(withdrawn.label).toBe("Withdrawn");
    expect(withdrawn.segments[0].state).toBe("withdrawn");
  });

  it("shows no position when the current stage is not on the spine and has no kind match", () => {
    const spine = buildSpine({
      current: { name: "Unknown", kind: "custom" },
      stages: canonical,
    });

    expect(spine.position).toBe(0);
    expect(spine.segments.every((segment) => segment.state === "todo")).toBe(true);
  });
});
