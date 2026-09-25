import { describe, expect, it } from "vitest";

import {
  AUTOMATION_LIFECYCLE_STAGE_META,
  jobLifecycleStage,
  proposalLifecycleStage,
  runLifecycleStage,
  type AutomationLifecycleStage,
} from "./lifecycle-status";

const ALL_STAGES: AutomationLifecycleStage[] = [
  "suggested",
  "validated",
  "simulated",
  "queued",
  "executed",
  "delivered",
  "uncertain",
];

describe("automation lifecycle vocabulary", () => {
  it("documents all seven stages the UI must distinguish", () => {
    expect(Object.keys(AUTOMATION_LIFECYCLE_STAGE_META).sort()).toEqual(
      [...ALL_STAGES].sort(),
    );
    for (const stage of ALL_STAGES) {
      expect(AUTOMATION_LIFECYCLE_STAGE_META[stage].label).toBeTruthy();
      expect(AUTOMATION_LIFECYCLE_STAGE_META[stage].description).toBeTruthy();
    }
  });
});

describe("proposalLifecycleStage", () => {
  it("maps the proposal path suggested → validated → simulated", () => {
    expect(
      proposalLifecycleStage({ status: "prepared", issuesCount: 2, simulationStatus: null }),
    ).toMatchObject({ stage: "suggested" });
    expect(
      proposalLifecycleStage({ status: "prepared", issuesCount: 0, simulationStatus: null }),
    ).toMatchObject({ stage: "validated" });
    expect(
      proposalLifecycleStage({ status: "prepared", issuesCount: 0, simulationStatus: "verified" }),
    ).toMatchObject({ stage: "simulated" });
    expect(
      proposalLifecycleStage({ status: "prepared", issuesCount: 0, simulationStatus: "partial" }),
    ).toMatchObject({ stage: "simulated" });
  });

  it("marks failed simulation as uncertain, never as simulated", () => {
    expect(
      proposalLifecycleStage({ status: "prepared", issuesCount: 0, simulationStatus: "failed" }),
    ).toMatchObject({ stage: "uncertain" });
  });

  it("marks in-flight apply as queued and applied work as executed", () => {
    expect(
      proposalLifecycleStage({ status: "applying", issuesCount: 0, simulationStatus: "verified" }),
    ).toMatchObject({ stage: "queued" });
    expect(
      proposalLifecycleStage({ status: "applied", issuesCount: 0, simulationStatus: "verified" }),
    ).toMatchObject({ stage: "executed" });
  });

  it("sends closed proposals back to suggested", () => {
    for (const status of ["expired", "rejected"]) {
      expect(
        proposalLifecycleStage({ status, issuesCount: 0, simulationStatus: "verified" }),
      ).toMatchObject({ stage: "suggested" });
    }
  });
});

describe("runLifecycleStage", () => {
  it("marks pending runs as queued", () => {
    for (const logicalStatus of ["queued", "waiting", "running", "retrying"]) {
      expect(runLifecycleStage({ logicalStatus })).toMatchObject({ stage: "queued" });
    }
  });

  it("marks uncertain outcomes as uncertain", () => {
    expect(runLifecycleStage({ logicalStatus: "uncertain" })).toMatchObject({
      stage: "uncertain",
    });
    expect(
      runLifecycleStage({
        logicalStatus: "succeeded",
        steps: [{ status: "succeeded" }, { status: "uncertain" }],
      }),
    ).toMatchObject({ stage: "uncertain" });
  });

  it("claims delivered only with succeeded external-step evidence", () => {
    expect(
      runLifecycleStage({
        logicalStatus: "succeeded",
        steps: [{ status: "succeeded", actionType: "send_email" }],
      }),
    ).toMatchObject({ stage: "delivered" });
    // No step evidence: executed, never delivered.
    expect(runLifecycleStage({ logicalStatus: "succeeded" })).toMatchObject({
      stage: "executed",
    });
    // Internal-only success stays executed.
    expect(
      runLifecycleStage({
        logicalStatus: "succeeded",
        steps: [{ status: "succeeded", actionType: "add_note" }],
      }),
    ).toMatchObject({ stage: "executed" });
  });

  it("marks terminal runs as executed", () => {
    for (const logicalStatus of ["failed", "cancelled", "stopped", "dead_letter"]) {
      expect(runLifecycleStage({ logicalStatus })).toMatchObject({ stage: "executed" });
    }
  });
});

describe("jobLifecycleStage", () => {
  it("maps pending jobs to queued and finished simulations to simulated", () => {
    expect(jobLifecycleStage("queued")).toMatchObject({ stage: "queued" });
    expect(jobLifecycleStage("running")).toMatchObject({ stage: "queued" });
    expect(jobLifecycleStage("succeeded")).toMatchObject({ stage: "simulated" });
  });

  it("marks unfinished jobs as uncertain", () => {
    expect(jobLifecycleStage("failed")).toMatchObject({ stage: "uncertain" });
    expect(jobLifecycleStage("expired")).toMatchObject({ stage: "uncertain" });
  });
});
