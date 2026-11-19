import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  score: vi.fn(),
  duplicates: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/applications/auto-resume-parse", () => ({
  scheduleApplicationResumeParse: mocks.parse,
}));
vi.mock("@/features/applications/auto-score", () => ({
  scheduleAutoScore: mocks.score,
}));
vi.mock("@/features/applications/auto-duplicates", () => ({
  scheduleAutoDuplicateCheck: mocks.duplicates,
}));

import { RESUME_PARSE_WAIT_MS, runApplicationIntakeJobs } from "./intake-jobs";

const INPUT = { applicationId: "app-1", candidateId: "cand-1", workspaceId: "ws-1" };

describe("runApplicationIntakeJobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.score.mockResolvedValue(undefined);
    mocks.duplicates.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("scores after the parse finishes and starts the duplicate check right away", async () => {
    let finishParse!: () => void;
    mocks.parse.mockReturnValue(new Promise<void>((resolve) => (finishParse = resolve)));

    const run = runApplicationIntakeJobs(INPUT);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.duplicates).toHaveBeenCalledWith("cand-1", "ws-1");
    expect(mocks.score).not.toHaveBeenCalled();

    finishParse();
    await run;
    expect(mocks.score).toHaveBeenCalledWith("app-1", "ws-1");
  });

  it("starts scoring at the deadline when the parse is slow", async () => {
    mocks.parse.mockReturnValue(new Promise<void>(() => {}));

    void runApplicationIntakeJobs(INPUT);
    await vi.advanceTimersByTimeAsync(RESUME_PARSE_WAIT_MS - 1);
    expect(mocks.score).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.score).toHaveBeenCalledWith("app-1", "ws-1");
  });
});
