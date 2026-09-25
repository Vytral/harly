import { describe, expect, it, vi } from "vitest";

import { createPdfTaskDisposer } from "./usePdfPageRenderer";

describe("createPdfTaskDisposer", () => {
  it("destroys a PDF.js loading task only once across completion and effect cleanup", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const dispose = createPdfTaskDisposer({ destroy });

    await Promise.all([dispose(), dispose(), dispose()]);

    expect(destroy).toHaveBeenCalledOnce();
  });

  it("preserves a task teardown failure for the caller", async () => {
    const error = new Error("PDF worker teardown failed");
    const destroy = vi.fn().mockRejectedValue(error);
    const dispose = createPdfTaskDisposer({ destroy });

    await expect(dispose()).rejects.toBe(error);
    await expect(dispose()).rejects.toBe(error);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
