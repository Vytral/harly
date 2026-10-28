import type { WorkspaceSearchActionResult } from "./actions";
import type { WorkspaceSearchResults } from "./results";
import { normalizeSearchQuery } from "./query";

/**
 * Client-side state machine behind the ⌘K palette. It owns debounce, request
 * sequencing, a hard timeout, and retry, so the palette cannot stay in a loading
 * state and a slow response cannot overwrite a newer one. It is framework-free
 * so the rules are unit-tested with fake timers.
 */

export const SEARCH_DEBOUNCE_MS = 150;
export const SEARCH_TIMEOUT_MS = 8000;
export const SEARCH_TIMEOUT_MESSAGE = "Search took too long. Try again.";
export const SEARCH_FAILED_MESSAGE = "Search didn't load. Try again.";

export type WorkspaceSearchStatus = "idle" | "loading" | "ready" | "error";

export type WorkspaceSearchState = {
  /** Normalized query the state belongs to; empty when idle. */
  query: string;
  status: WorkspaceSearchStatus;
  /**
   * Last results received. While a newer query is loading these remain on screen
   * (marked stale by the UI); they are cleared on error and when the query empties.
   */
  results: WorkspaceSearchResults | null;
  error: string | null;
};

export type WorkspaceSearchFn = (
  rawQuery: string,
) => Promise<WorkspaceSearchActionResult>;

export type WorkspaceSearchControllerOptions = {
  search: WorkspaceSearchFn;
  debounceMs?: number;
  timeoutMs?: number;
};

const IDLE: WorkspaceSearchState = {
  query: "",
  status: "idle",
  results: null,
  error: null,
};

export class WorkspaceSearchController {
  private state: WorkspaceSearchState = IDLE;
  private readonly listeners = new Set<() => void>();
  /** Bumped whenever an answer becomes irrelevant (new query, retry, timeout, reset). */
  private generation = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly search: WorkspaceSearchFn;
  private readonly debounceMs: number;
  private readonly timeoutMs: number;

  constructor(options: WorkspaceSearchControllerOptions) {
    this.search = options.search;
    this.debounceMs = options.debounceMs ?? SEARCH_DEBOUNCE_MS;
    this.timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS;
  }

  /** Stable getter for `useSyncExternalStore`: same object until something changes. */
  getState = (): WorkspaceSearchState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Update the query from the input. Searches after the debounce window. */
  setQuery(rawQuery: string): void {
    const query = normalizeSearchQuery(rawQuery)?.text ?? "";
    if (query === this.state.query && this.state.status !== "error") return;

    this.cancelPending();
    if (!query) {
      this.commit(IDLE);
      return;
    }

    this.commit({
      query,
      status: "loading",
      results: this.state.results,
      error: null,
    });
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.run(query);
    }, this.debounceMs);
  }

  /** Run the current query again now, e.g. from the error row's Retry button. */
  retry(): void {
    if (!this.state.query) return;
    this.cancelPending();
    this.run(this.state.query);
  }

  /** Clear the query and drop any in-flight answer, e.g. when the palette closes. */
  reset(): void {
    this.cancelPending();
    this.commit(IDLE);
  }

  /** Stop timers and ignore in-flight answers without changing state (unmount). */
  cancel(): void {
    this.cancelPending();
  }

  private run(query: string): void {
    const generation = ++this.generation;
    this.clearTimeoutTimer();
    this.commit({
      query,
      status: "loading",
      results: this.state.results,
      error: null,
    });

    this.timeoutTimer = setTimeout(() => {
      this.timeoutTimer = null;
      if (generation !== this.generation) return;
      this.fail(generation, SEARCH_TIMEOUT_MESSAGE);
    }, this.timeoutMs);

    let pending: Promise<WorkspaceSearchActionResult>;
    try {
      pending = Promise.resolve(this.search(query));
    } catch {
      pending = Promise.reject(new Error("search threw synchronously"));
    }

    pending.then(
      (response) => {
        if (generation !== this.generation) return;
        this.clearTimeoutTimer();
        if (response.ok) {
          this.commit({
            query,
            status: "ready",
            results: response.results,
            error: null,
          });
        } else {
          this.fail(generation, response.error || SEARCH_FAILED_MESSAGE);
        }
      },
      () => {
        if (generation !== this.generation) return;
        this.fail(generation, SEARCH_FAILED_MESSAGE);
      },
    );
  }

  private fail(generation: number, message: string): void {
    if (generation !== this.generation) return;
    // Invalidate this attempt so a late response cannot replace the error.
    this.generation += 1;
    this.clearTimeoutTimer();
    this.commit({
      query: this.state.query,
      status: "error",
      results: null,
      error: message,
    });
  }

  private cancelPending(): void {
    this.generation += 1;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.clearTimeoutTimer();
  }

  private clearTimeoutTimer(): void {
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private commit(next: WorkspaceSearchState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
