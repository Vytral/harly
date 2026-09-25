import { describe, expect, it } from "vitest";

import { validateVectorSaveInput } from "./signature-vector";

describe("validateVectorSaveInput (pure, no DB)", () => {
  it("accepts a plausible compressed payload", () => {
    const out = validateVectorSaveInput({ vectorData: "QUJDMTIz" });
    expect(out.ok).toBe(true);
  });

  it("rejects empty, missing, oversized, and non-base64 input", () => {
    expect(validateVectorSaveInput({ vectorData: "" }).ok).toBe(false);
    expect(validateVectorSaveInput({}).ok).toBe(false);
    expect(validateVectorSaveInput(null).ok).toBe(false);
    expect(validateVectorSaveInput({ vectorData: "a".repeat(100_001) }).ok).toBe(false);
    expect(validateVectorSaveInput({ vectorData: "!!! nope !!!" }).ok).toBe(false);
    expect(validateVectorSaveInput({ vectorData: " spaces inside " }).ok).toBe(false);
  });
});
