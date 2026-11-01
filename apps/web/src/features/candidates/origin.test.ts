import { describe, expect, it } from "vitest";

import {
  candidateHref,
  candidateNavigationParams,
  directoryOrigin,
  DIRECTORY_ORIGIN,
  originBackLabel,
  originHref,
  originLabel,
  parseCandidateNavigation,
  pipelineOrigin,
  REVIEW_ORIGIN,
} from "./origin";
import { reviewApplicationHref } from "@/features/review/rules";

const CANDIDATE = "11111111-1111-4111-8111-111111111111";
const APP = "22222222-2222-4222-8222-222222222222";
const JOB = "33333333-3333-4333-8333-333333333333";
const STAGE = "44444444-4444-4444-8444-444444444444";

function parseHref(href: string) {
  const url = new URL(href, "https://harly.test");
  return { path: url.pathname, nav: parseCandidateNavigation(url.searchParams) };
}

describe("candidate origin: review queue", () => {
  it("encodes the queue like the review rules do", () => {
    expect(candidateHref(CANDIDATE, REVIEW_ORIGIN, APP)).toBe(reviewApplicationHref(CANDIDATE, APP));
  });

  it("round-trips and goes back to the queue", () => {
    const { nav } = parseHref(candidateHref(CANDIDATE, REVIEW_ORIGIN, APP));
    expect(nav).toEqual({ origin: REVIEW_ORIGIN, applicationId: APP });
    expect(originHref(nav.origin)).toBe("/dashboard/candidates?queue=review");
    expect(originLabel(nav.origin)).toBe("Review queue");
    expect(originBackLabel(nav.origin)).toBe("Back to review queue");
  });

  it("drops an application id that is not a uuid", () => {
    expect(parseCandidateNavigation({ queue: "review", application: "x' or 1=1" }).applicationId).toBeNull();
  });
});

describe("candidate origin: directory", () => {
  it("keeps the unfiltered directory links bare", () => {
    expect(candidateHref(CANDIDATE)).toBe(`/dashboard/candidates/${CANDIDATE}`);
    expect(candidateHref(CANDIDATE, directoryOrigin({ q: "", dept: "__all__", sort: "recent" }))).toBe(
      `/dashboard/candidates/${CANDIDATE}`,
    );
  });

  it("parses no params as the unfiltered directory", () => {
    expect(parseCandidateNavigation({})).toEqual({ origin: DIRECTORY_ORIGIN, applicationId: null });
    expect(originHref(DIRECTORY_ORIGIN)).toBe("/dashboard/candidates");
    expect(originLabel(DIRECTORY_ORIGIN)).toBe("Candidates");
  });

  it("carries filters readably and restores them on Back", () => {
    const origin = directoryOrigin(new URLSearchParams("q=ana%20lee&stage=Interview&sort=name&page=3"));
    const href = candidateHref(CANDIDATE, origin);
    expect(href).toBe(`/dashboard/candidates/${CANDIDATE}?from=candidates&q=ana+lee&stage=Interview&sort=name`);
    const { nav } = parseHref(href);
    expect(nav.origin).toEqual({ kind: "candidates", filters: { q: "ana lee", stage: "Interview", sort: "name" } });
    expect(originHref(nav.origin)).toBe("/dashboard/candidates?q=ana+lee&stage=Interview&sort=name");
    expect(originLabel(nav.origin)).toBe("Filtered candidates");
  });

  it("ignores unknown statuses and sorts and trims long text", () => {
    const origin = directoryOrigin({ status: "deleted", sort: "random", q: `  ${"a".repeat(300)}  ` });
    expect(origin).toEqual({ kind: "candidates", filters: { q: "a".repeat(100) } });
  });

  it("never carries an application for directory rows", () => {
    expect(candidateNavigationParams(DIRECTORY_ORIGIN, APP).toString()).toBe("");
  });
});

describe("candidate origin: pipeline", () => {
  it("round-trips job, stage, search and view", () => {
    const origin = pipelineOrigin({ jobId: JOB, stage: STAGE, q: "ana", view: "board" });
    const href = candidateHref(CANDIDATE, origin, APP);
    expect(href).toBe(
      `/dashboard/candidates/${CANDIDATE}?from=pipeline&jobId=${JOB}&stage=${STAGE}&q=ana&view=board&application=${APP}`,
    );
    const { path, nav } = parseHref(href);
    expect(path).toBe(`/dashboard/candidates/${CANDIDATE}`);
    expect(nav).toEqual({ origin, applicationId: APP });
    expect(originHref(origin)).toBe(`/dashboard/pipeline?jobId=${JOB}&view=board&stage=${STAGE}&q=ana`);
    expect(originBackLabel(origin)).toBe("Back to pipeline");
  });

  it("drops the stage when it is the 'all' sentinel or not an id", () => {
    expect(pipelineOrigin({ jobId: JOB, stage: "__all__" })).toEqual({ kind: "pipeline", jobId: JOB });
    expect(pipelineOrigin({ jobId: JOB, stage: "Interview" })).toEqual({ kind: "pipeline", jobId: JOB });
  });

  it("falls back to the directory without a valid job id", () => {
    expect(parseCandidateNavigation({ from: "pipeline", jobId: "nope" }).origin).toEqual(DIRECTORY_ORIGIN);
  });

  it("reads array-valued params from Next's searchParams", () => {
    const nav = parseCandidateNavigation({ from: "pipeline", jobId: [JOB, "other"], application: APP });
    expect(nav).toEqual({ origin: { kind: "pipeline", jobId: JOB }, applicationId: APP });
  });
});
