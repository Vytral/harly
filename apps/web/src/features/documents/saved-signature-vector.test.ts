import { describe, expect, it } from "vitest";

import { validateVectorSaveInput } from "./signature-vector";

const t = (key: string) => key;

describe("validateVectorSaveInput (pure, no DB)", () => {
  it("accepts a plausible compressed payload", () => {
    const out = validateVectorSaveInput({ vectorData: "QUJDMTIz" }, t);
    expect(out.ok).toBe(true);
  });

  it("rejects empty, missing, oversized, and non-base64 input", () => {
    expect(validateVectorSaveInput({ vectorData: "" }, t).ok).toBe(false);
    expect(validateVectorSaveInput({}, t).ok).toBe(false);
    expect(validateVectorSaveInput(null, t).ok).toBe(false);
    expect(validateVectorSaveInput({ vectorData: "a".repeat(100_001) }, t).ok).toBe(false);
    expect(validateVectorSaveInput({ vectorData: "!!! nope !!!" }, t).ok).toBe(false);
    expect(validateVectorSaveInput({ vectorData: " spaces inside " }, t).ok).toBe(false);
  });
});
