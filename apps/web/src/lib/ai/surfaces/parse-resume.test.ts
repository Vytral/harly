import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  Output: { object: (value: unknown) => value },
  generateText: vi.fn(),
}));
vi.mock("@/lib/ai/registry", () => ({ getModel: () => ({ mock: true }) }));
vi.mock("@/lib/ai/usage", () => ({ recordAiUsage: vi.fn() }));

import { generateText } from "ai";

import { recordAiUsage } from "@/lib/ai/usage";

import {
  PARSE_AUTOFILL_MAX_CHARS,
  PARSE_MAX_RETRIES,
  parseResumeStructured,
  parseResumeWithAI,
} from "./parse-resume";

const config = { provider: "openai", modelId: "gpt-4o", apiKey: "sk-test" } as const;
const usage = { inputTokens: 120, outputTokens: 30 };
const autofillOutput = {
  firstName: null, lastName: null, email: null, phone: null, location: null,
  linkedinUrl: null, githubUrl: null, websiteUrl: null, skills: [], experienceYears: null, education: null,
};

beforeEach(() => {
  vi.mocked(generateText).mockReset();
  vi.mocked(recordAiUsage).mockReset();
});

describe("parseResumeWithAI", () => {
  it("records usage, sets maxRetries and an abort signal", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: autofillOutput, usage } as never);
    await parseResumeWithAI(config, "Ana Torres\nEngineer", undefined, { workspaceId: "ws1" });

    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "parse_resume", workspaceId: "ws1", promptTokens: 120, completionTokens: 30 }),
    );
    const call = vi.mocked(generateText).mock.calls[0]![0] as { maxRetries?: number; abortSignal?: AbortSignal };
    expect(call.maxRetries).toBe(PARSE_MAX_RETRIES);
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("propagates caller cancellation", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: autofillOutput, usage } as never);
    const controller = new AbortController();
    controller.abort();
    await parseResumeWithAI(config, "x", undefined, { abortSignal: controller.signal });
    const call = vi.mocked(generateText).mock.calls[0]![0] as { abortSignal: AbortSignal };
    expect(call.abortSignal.aborted).toBe(true);
  });

  it("truncates at a line boundary and reports it", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: autofillOutput, usage } as never);
    const line = "Built backend services in Python\n";
    const text = line.repeat(Math.ceil((PARSE_AUTOFILL_MAX_CHARS * 1.5) / line.length));
    const diagnostics: string[] = [];
    await parseResumeWithAI(config, text, undefined, { onDiagnostic: (m) => diagnostics.push(m) });

    expect(diagnostics.join(" ")).toMatch(/truncated: kept \d+ of \d+/);
    const prompt = (vi.mocked(generateText).mock.calls[0]![0] as { prompt: string }).prompt;
    const body = prompt.split('"""\n')[1]!.replace(/\n"""$/, "");
    expect(body.endsWith("Python")).toBe(true);
    expect(body.split("\n").every((l) => l === "" || l === line.trim())).toBe(true);
  });

  it("does not report truncation for short input", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: autofillOutput, usage } as never);
    const diagnostics: string[] = [];
    await parseResumeWithAI(config, "short", undefined, { onDiagnostic: (m) => diagnostics.push(m) });
    expect(diagnostics).toEqual([]);
  });
});

describe("parseResumeStructured", () => {
  it("records usage and returns truncation diagnostics", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { summary: null, skills: [], experienceYears: null, experience: [], education: [] },
      usage,
    } as never);
    const text = "Line of resume text\n".repeat(2000);
    const result = await parseResumeStructured(config, text);
    expect(recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({ surface: "parse_resume_profile" }));
    expect(result.diagnostics.join(" ")).toMatch(/truncated/);
  });
});
