import { describe, expect, it } from "vitest";

import {
  describeAction,
  describeConditions,
  describeTrigger,
  describeWorkflow,
} from "./preview";
import type { Action, ConditionNode, Trigger } from "../schema";

const trigger = (event: Trigger["event"]): Trigger => ({ event });

describe("preview — describeTrigger", () => {
  it("renders the event label lower-cased", () => {
    expect(describeTrigger(trigger("application.created"))).toBe("a candidate applies");
  });

  it("appends the filter when present", () => {
    expect(
      describeTrigger({ event: "application.created", filter: { jobId: "job-1" } }),
    ).toBe('a candidate applies where jobId is "job-1"');
  });

  it("ignores an empty filter object", () => {
    expect(describeTrigger({ event: "interview.scheduled", filter: {} })).toBe("an interview scheduled");
  });
});

describe("preview — describeConditions", () => {
  it("returns 'always' for empty / undefined", () => {
    expect(describeConditions(undefined)).toBe("always");
    expect(describeConditions([])).toBe("always");
  });

  it("renders a single leaf", () => {
    const leaf: ConditionNode = {
      type: "leaf",
      field: { kind: "candidate", path: "firstName" },
      op: "eq",
      value: "Ada",
    };
    expect(describeConditions([leaf])).toBe('candidate.firstName equals "Ada"');
  });

  it("renders an AND group", () => {
    const node: ConditionNode = {
      type: "and",
      children: [
        { type: "leaf", field: { kind: "job", path: "seniority" }, op: "eq", value: "junior" },
        { type: "leaf", field: { kind: "ai", path: "score" }, op: "lt", value: 40 },
      ],
    };
    expect(describeConditions([node])).toBe('job.seniority equals "junior" and ai.score is less than 40');
  });

  it("renders is_set without a value", () => {
    const leaf: ConditionNode = {
      type: "leaf",
      field: { kind: "candidate", path: "email" },
      op: "is_set",
      value: null,
    };
    expect(describeConditions([leaf])).toBe("candidate.email is set");
  });

  it("truncates long values with an ellipsis inside the quotes", () => {
    const long = "x".repeat(120);
    const leaf: ConditionNode = {
      type: "leaf",
      field: { kind: "candidate", path: "headline" },
      op: "contains",
      value: long,
    };
    const out = describeConditions([leaf]);
    expect(out).toContain("…");
    expect(out.length).toBeLessThan(long.length + 40);
  });
});

describe("preview — describeAction", () => {
  it("summarizes move_stage by target", () => {
    const a: Action = { type: "move_stage", config: { toStageName: "Phone screen" }, continueOnError: false };
    expect(describeAction(a)).toBe("move to Phone screen");
  });

  it("summarizes set_status", () => {
    const a: Action = { type: "set_status", config: { status: "rejected" }, continueOnError: false };
    expect(describeAction(a)).toBe("set status to rejected");
  });

  it("summarizes add_tag", () => {
    const a: Action = { type: "add_tag", config: { label: "vip" }, continueOnError: false };
    expect(describeAction(a)).toBe('add the "vip" tag');
  });

  it("summarizes http_request with method + url", () => {
    const a: Action = { type: "http_request", config: { method: "POST", url: "https://x.dev/h" }, continueOnError: false };
    expect(describeAction(a)).toBe("POST https://x.dev/h");
  });

  it("falls back to the catalog label for an unregistered type", () => {
    const a = { type: "ai_decide", config: {}, continueOnError: false } as unknown as Action;
    expect(describeAction(a)).toBe("ai: decide");
  });
});

describe("preview — describeWorkflow (full sentence)", () => {
  it("composes when / if / then", () => {
    const out = describeWorkflow({
      trigger: { event: "application.created" },
      conditions: [
        { type: "leaf", field: { kind: "ai", path: "score" }, op: "gte", value: 80 },
      ],
      actions: [{ type: "add_tag", config: { label: "vip" }, continueOnError: true }],
    });
    expect(out).toBe('When a candidate applies, if ai.score is at least 80, then add the "vip" tag.');
  });

  it("omits the if clause when there are no conditions", () => {
    const out = describeWorkflow({
      trigger: { event: "application.created" },
      conditions: [],
      actions: [{ type: "send_slack", config: { message: "hi" }, continueOnError: true }],
    });
    expect(out).toBe('When a candidate applies, then send a chat message "hi".');
  });

  it("says 'do nothing' for an empty action list", () => {
    const out = describeWorkflow({
      trigger: { event: "job.published" },
      conditions: [],
      actions: [],
    });
    expect(out).toBe("When a job published, then do nothing.");
  });

  it("joins multiple actions with commas + 'and'", () => {
    const out = describeWorkflow({
      trigger: { event: "application.created" },
      conditions: [],
      actions: [
        { type: "set_status", config: { status: "rejected" }, continueOnError: false },
        { type: "add_tag", config: { label: "auto-rejected" }, continueOnError: true },
      ],
    });
    expect(out).toBe("When a candidate applies, then set status to rejected and add the \"auto-rejected\" tag.");
  });
});
