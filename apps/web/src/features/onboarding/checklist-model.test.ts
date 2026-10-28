import { describe, expect, it } from "vitest";

import {
  applyChecklistAction,
  buildSetupChecklist,
  CHECKLIST_ITEM_KEYS,
  type ChecklistFacts,
  type ChecklistPreferences,
  normalizeSkippedKeys,
} from "./checklist-model";

const EMPTY_FACTS: ChecklistFacts = {
  jobCount: 0,
  publishedJobCount: 0,
  applicationCount: 0,
  emailConnected: false,
  calendarConnected: false,
  automationCount: 0,
  teammateInvited: false,
};

const NONE: ChecklistPreferences = { dismissed: false, skipped: [] };

function build(
  facts: Partial<ChecklistFacts> = {},
  preferences: Partial<ChecklistPreferences> = {},
  canManage = true,
) {
  return buildSetupChecklist({
    facts: { ...EMPTY_FACTS, ...facts },
    preferences: { ...NONE, ...preferences },
    canManage,
  });
}

function doneKeys(model: ReturnType<typeof build>) {
  return model.items.filter((item) => item.done).map((item) => item.key);
}

describe("buildSetupChecklist: derivation matrix", () => {
  it("lists the guided steps in order, starting with the teammate invite", () => {
    const model = build();
    expect(model.items.map((item) => item.key)).toEqual([...CHECKLIST_ITEM_KEYS]);
    expect(model.items[0].key).toBe("invite_teammate");
    expect(model.items.at(-1)?.key).toBe("automate_workflow");
  });

  it("starts empty: nothing done, first step is the next step", () => {
    const model = build();
    expect(model.completed).toBe(0);
    expect(model.percent).toBe(0);
    expect(model.allDone).toBe(false);
    expect(model.nextStep?.key).toBe("invite_teammate");
    expect(model.showCard).toBe(true);
  });

  it.each([
    ["invite_teammate", { teammateInvited: true }],
    ["create_job", { jobCount: 1 }],
    ["publish_job", { publishedJobCount: 1 }],
    ["pipeline_candidates", { applicationCount: 1 }],
    ["connect_email", { emailConnected: true }],
    ["connect_calendar", { calendarConnected: true }],
    ["automate_workflow", { automationCount: 1 }],
  ] as const)("marks %s done only from its own fact", (key, fact) => {
    const model = build(fact);
    expect(doneKeys(model)).toEqual([key]);
  });

  it("does not treat a job as published when it is only a draft", () => {
    const model = build({ jobCount: 1, publishedJobCount: 0 });
    expect(doneKeys(model)).toEqual(["create_job"]);
    expect(model.nextStep?.key).toBe("invite_teammate");
  });

  it("advances the next step to the first unfinished row", () => {
    const model = build({ teammateInvited: true, jobCount: 1, publishedJobCount: 1 });
    expect(model.nextStep?.key).toBe("pipeline_candidates");
  });

  it("reports allDone and removes the card when everything is derived done", () => {
    const model = build({
      teammateInvited: true,
      jobCount: 2,
      publishedJobCount: 1,
      applicationCount: 4,
      emailConnected: true,
      calendarConnected: true,
      automationCount: 3,
    });
    expect(model.allDone).toBe(true);
    expect(model.percent).toBe(100);
    expect(model.nextStep).toBeNull();
    expect(model.showCard).toBe(false);
  });

  it("hides the card from recruiters even when steps remain", () => {
    const model = build({}, {}, false);
    expect(model.visible).toBe(false);
    expect(model.showCard).toBe(false);
  });
});

describe("buildSetupChecklist: dismiss and skip", () => {
  it("hides the card when dismissed, without changing the derived rows", () => {
    const model = build({ jobCount: 1 }, { dismissed: true });
    expect(model.dismissed).toBe(true);
    expect(model.showCard).toBe(false);
    expect(doneKeys(model)).toEqual(["create_job"]);
  });

  it("skips optional steps and moves the next step past them", () => {
    const model = build({}, { skipped: ["invite_teammate"] });
    const invite = model.items.find((item) => item.key === "invite_teammate");
    expect(invite?.skipped).toBe(true);
    expect(model.nextStep?.key).toBe("create_job");
  });

  it("ignores skips on required steps", () => {
    const model = build({}, { skipped: ["create_job"] });
    const createJob = model.items.find((item) => item.key === "create_job");
    expect(createJob?.skipped).toBe(false);
    expect(model.nextStep?.key).toBe("invite_teammate");
  });

  it("does not mark a done optional step as skipped", () => {
    const model = build({ teammateInvited: true }, { skipped: ["invite_teammate"] });
    const invite = model.items.find((item) => item.key === "invite_teammate");
    expect(invite?.done).toBe(true);
    expect(invite?.skipped).toBe(false);
  });

  it("hides the card when every remaining step is skipped", () => {
    const model = build(
      {
        teammateInvited: false,
        jobCount: 1,
        publishedJobCount: 1,
        applicationCount: 1,
        emailConnected: true,
      },
      { skipped: ["invite_teammate", "connect_calendar", "automate_workflow"] },
    );
    expect(model.nextStep).toBeNull();
    expect(model.showCard).toBe(false);
  });
});

describe("normalizeSkippedKeys", () => {
  it("keeps only known optional keys, once each", () => {
    expect(
      normalizeSkippedKeys([
        "invite_teammate",
        "invite_teammate",
        "create_job",
        "retired_step",
        42,
        null,
        "connect_calendar",
      ]),
    ).toEqual(["invite_teammate", "connect_calendar"]);
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(normalizeSkippedKeys(undefined)).toEqual([]);
    expect(normalizeSkippedKeys({ invite_teammate: true })).toEqual([]);
    expect(normalizeSkippedKeys("invite_teammate")).toEqual([]);
  });
});

describe("applyChecklistAction", () => {
  it("dismisses without touching skipped steps", () => {
    const result = applyChecklistAction(
      { dismissed: false, skipped: ["invite_teammate"] },
      { type: "dismiss" },
    );
    expect(result).toEqual({
      ok: true,
      preferences: { dismissed: true, skipped: ["invite_teammate"] },
    });
  });

  it("restores everything, including skipped steps", () => {
    const result = applyChecklistAction(
      { dismissed: true, skipped: ["invite_teammate", "connect_calendar"] },
      { type: "restore" },
    );
    expect(result).toEqual({ ok: true, preferences: NONE });
  });

  it("skips an optional step once, even when repeated", () => {
    const first = applyChecklistAction(NONE, { type: "skip", key: "connect_calendar" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyChecklistAction(first.preferences, {
      type: "skip",
      key: "connect_calendar",
    });
    expect(second).toEqual({
      ok: true,
      preferences: { dismissed: false, skipped: ["connect_calendar"] },
    });
  });

  it("rejects skipping a required or unknown step", () => {
    expect(applyChecklistAction(NONE, { type: "skip", key: "create_job" }).ok).toBe(false);
    expect(applyChecklistAction(NONE, { type: "skip", key: "nope" }).ok).toBe(false);
  });
});
