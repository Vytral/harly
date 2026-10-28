import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceSearchActionResult } from "./actions";
import {
  SEARCH_FAILED_MESSAGE,
  SEARCH_TIMEOUT_MESSAGE,
  WorkspaceSearchController,
} from "./search-controller";
import { emptyWorkspaceSearchResults } from "./results";

function okResult(query: string): WorkspaceSearchActionResult {
  return { ok: true, results: { ...emptyWorkspaceSearchResults(query) } };
}

type Deferred = {
  promise: Promise<WorkspaceSearchActionResult>;
  resolve: (value: WorkspaceSearchActionResult) => void;
  reject: (reason: unknown) => void;
};

function deferred(): Deferred {
  let resolve!: Deferred["resolve"];
  let reject!: Deferred["reject"];
  const promise = new Promise<WorkspaceSearchActionResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let queued promise callbacks run. */
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("WorkspaceSearchController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces keystrokes into a single request", async () => {
    const search = vi.fn(async (query: string) => okResult(query));
    const controller = new WorkspaceSearchController({ search });

    controller.setQuery("a");
    controller.setQuery("ad");
    controller.setQuery("ada");
    expect(search).not.toHaveBeenCalled();

    vi.advanceTimersByTime(149);
    expect(search).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("ada");

    await flush();
    expect(controller.getState()).toMatchObject({ query: "ada", status: "ready" });
  });

  it("ignores a slow response that a newer query has superseded", async () => {
    const first = deferred();
    const second = deferred();
    const search = vi
      .fn<(query: string) => Promise<WorkspaceSearchActionResult>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = new WorkspaceSearchController({ search });

    controller.setQuery("ad");
    vi.advanceTimersByTime(150);
    controller.setQuery("ada");
    vi.advanceTimersByTime(150);

    second.resolve(okResult("ada"));
    await flush();
    expect(controller.getState()).toMatchObject({ query: "ada", status: "ready" });

    first.resolve(okResult("ad"));
    await flush();
    expect(controller.getState()).toMatchObject({ query: "ada", status: "ready" });
    expect(controller.getState().results?.query).toBe("ada");
  });

  it("never leaves the palette loading when the request rejects", async () => {
    const search = vi.fn(async () => {
      throw new Error("network down");
    });
    const controller = new WorkspaceSearchController({ search });

    controller.setQuery("ada");
    vi.advanceTimersByTime(150);
    await flush();

    expect(controller.getState()).toMatchObject({
      status: "error",
      error: SEARCH_FAILED_MESSAGE,
      results: null,
    });
  });

  it("surfaces a failed action result as an error with its message", async () => {
    const search = vi.fn(
      async (): Promise<WorkspaceSearchActionResult> => ({
        ok: false,
        error: "Search didn't load. Try again.",
      }),
    );
    const controller = new WorkspaceSearchController({ search });

    controller.setQuery("ada");
    vi.advanceTimersByTime(150);
    await flush();

    expect(controller.getState().status).toBe("error");
    expect(controller.getState().error).toBe("Search didn't load. Try again.");
  });

  it("times out a request that never settles and ignores its late answer", async () => {
    const pending = deferred();
    const search = vi
      .fn<(query: string) => Promise<WorkspaceSearchActionResult>>()
      .mockReturnValueOnce(pending.promise);
    const controller = new WorkspaceSearchController({ search, timeoutMs: 1000 });

    controller.setQuery("ada");
    vi.advanceTimersByTime(150);
    vi.advanceTimersByTime(1000);
    expect(controller.getState()).toMatchObject({
      status: "error",
      error: SEARCH_TIMEOUT_MESSAGE,
    });

    pending.resolve(okResult("ada"));
    await flush();
    expect(controller.getState().status).toBe("error");
  });

  it("retries the same query after an error", async () => {
    const search = vi
      .fn<(query: string) => Promise<WorkspaceSearchActionResult>>()
      .mockResolvedValueOnce({ ok: false, error: "boom" })
      .mockResolvedValueOnce(okResult("ada"));
    const controller = new WorkspaceSearchController({ search });

    controller.setQuery("ada");
    vi.advanceTimersByTime(150);
    await flush();
    expect(controller.getState().status).toBe("error");

    controller.retry();
    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenLastCalledWith("ada");
    await flush();
    expect(controller.getState()).toMatchObject({ query: "ada", status: "ready" });
  });

  it("does nothing on retry when there is no query", () => {
    const search = vi.fn(async (query: string) => okResult(query));
    const controller = new WorkspaceSearchController({ search });
    controller.retry();
    expect(search).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe("idle");
  });

  it("returns to idle without searching when the query is blank", () => {
    const search = vi.fn(async (query: string) => okResult(query));
    const controller = new WorkspaceSearchController({ search });

    controller.setQuery("ada");
    controller.setQuery("   ");
    vi.advanceTimersByTime(500);

    expect(search).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({
      query: "",
      status: "idle",
      results: null,
      error: null,
    });
  });

  it("drops in-flight work on reset so a closed palette cannot repaint", async () => {
    const pending = deferred();
    const search = vi
      .fn<(query: string) => Promise<WorkspaceSearchActionResult>>()
      .mockReturnValueOnce(pending.promise);
    const controller = new WorkspaceSearchController({ search });

    controller.setQuery("ada");
    vi.advanceTimersByTime(150);
    controller.reset();

    pending.resolve(okResult("ada"));
    await flush();
    expect(controller.getState().status).toBe("idle");
    expect(controller.getState().query).toBe("");
  });

  it("keeps the previous results on screen while a new query loads", async () => {
    const search = vi
      .fn<(query: string) => Promise<WorkspaceSearchActionResult>>()
      .mockResolvedValueOnce(okResult("ad"))
      .mockReturnValueOnce(new Promise(() => {}));
    const controller = new WorkspaceSearchController({ search });

    controller.setQuery("ad");
    vi.advanceTimersByTime(150);
    await flush();
    const ready = controller.getState().results;

    controller.setQuery("ada");
    expect(controller.getState()).toMatchObject({ query: "ada", status: "loading" });
    expect(controller.getState().results).toBe(ready);
  });

  it("notifies subscribers only when the state changes", () => {
    const search = vi.fn(async (query: string) => okResult(query));
    const controller = new WorkspaceSearchController({ search });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.setQuery("ada");
    expect(listener).toHaveBeenCalledTimes(1);

    controller.setQuery("ada");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    controller.setQuery("");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("cancel() stops pending work without changing the visible state", async () => {
    const search = vi.fn(async (query: string) => okResult(query));
    const controller = new WorkspaceSearchController({ search });

    controller.setQuery("ada");
    controller.cancel();
    vi.advanceTimersByTime(500);

    expect(search).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ query: "ada", status: "loading" });
  });
});
