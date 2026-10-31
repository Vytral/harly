import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("unpdf", () => ({
  // Never settles: simulates a pathological PDF that hangs the parser.
  getDocumentProxy: () => new Promise(() => {}),
  extractText: () => new Promise(() => {}),
}));

import { EXTRACTION_TIMEOUT_MS, extractResumeText } from "./extract-text";

describe("extractResumeText timeout", () => {
  afterEach(() => vi.useRealTimers());

  it("gives up with a diagnostic instead of hanging", async () => {
    vi.useFakeTimers();
    const pending = extractResumeText({
      buffer: Buffer.from("%PDF-1.7\nstuff", "utf8"),
      fileName: "slow.pdf",
    });
    await vi.advanceTimersByTimeAsync(EXTRACTION_TIMEOUT_MS + 1);
    const result = await pending;
    expect(result.text).toBe("");
    expect(result.diagnostics.join(" ")).toMatch(/timed out/);
  });
});
