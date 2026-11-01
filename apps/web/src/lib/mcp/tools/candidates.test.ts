import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/lib/auth", () => ({ auth: { api: {} } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ssrf", () => ({ safeFetchHttp: vi.fn() }));

import { McpToolError } from "../types";
import { candidatesTools } from "./candidates";
import {
  candidateUrl,
  classifyFailure,
  cleanText,
  directoryWindow,
  mapActionError,
  noteWithOrigin,
  resolveStageRef,
  summarizeConsent,
} from "./candidates/helpers";
import { decodeBase64Resume, resumeTypeForFileName, sniffResumeType, resumeInputSchema } from "./candidates/resume-input";

const byName = (name: string) => candidatesTools.find((tool) => tool.name === name)!;

describe("candidates tool definitions", () => {
  it("has unique names in the candidates/pipeline groups with candidate scopes", () => {
    const names = candidatesTools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of candidatesTools) {
      expect(["candidates", "pipeline"]).toContain(tool.group);
      expect(tool.scope).toMatch(/^candidates:(read|write)$/);
      expect(tool.scope === "candidates:read").toBe(tool.annotations.readOnlyHint);
      const schema = z.toJSONSchema(tool.input, { io: "input" }) as { properties?: Record<string, { description?: string }> };
      for (const [field, def] of Object.entries(schema.properties ?? {})) {
        expect(def.description, `${tool.name}.${field}`).toBeTruthy();
      }
    }
  });

  it("flags emailing and destructive tools", () => {
    expect(byName("applications_reject").annotations).toMatchObject({ destructiveHint: true, openWorldHint: true });
    expect(byName("applications_set_status").annotations).toMatchObject({ destructiveHint: true, openWorldHint: true });
    expect(byName("applications_move_stage").annotations.openWorldHint).toBe(true);
    expect(byName("candidates_trash").annotations.destructiveHint).toBe(true);
    expect(byName("candidates_search").annotations.readOnlyHint).toBe(true);
  });

  it("never offers permanent deletion", () => {
    expect(candidatesTools.some((tool) => /delete|purge|erase/.test(tool.name))).toBe(false);
  });

  it("requires an explicit sendEmail decision when rejecting", () => {
    const input = byName("applications_reject").input;
    const base = { applicationIds: ["6f1c1e0e-1111-4111-8111-111111111111"], reasonCode: "other" };
    expect(input.safeParse(base).success).toBe(false);
    expect(input.safeParse({ ...base, sendEmail: false }).success).toBe(true);
  });

  it("bounds bulk operations at 100", () => {
    const ids = Array.from({ length: 101 }, (_, i) => `6f1c1e0e-1111-4111-8111-${String(i).padStart(12, "0")}`);
    expect(byName("applications_bulk_move").input.safeParse({ applicationIds: ids, stageId: ids[0] }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("strips hidden characters and caps text", () => {
    expect(cleanText("a​b\u0000c\u{E0041}d")).toBe("abcd");
    expect(cleanText("x".repeat(20), 10)).toHaveLength(10);
    expect(cleanText("   ")).toBeNull();
  });

  it("maps window offsets onto directory pages", () => {
    expect(directoryWindow(0, 25)).toEqual({ pageSize: 100, pages: [1], skip: 0 });
    expect(directoryWindow(90, 25)).toEqual({ pageSize: 100, pages: [1, 2], skip: 90 });
    expect(directoryWindow(200, 10).pages).toEqual([3]);
  });

  it("classifies action failures", () => {
    expect(classifyFailure("You do not have permission to perform this action.")).toBe("forbidden");
    expect(classifyFailure("Application not found.")).toBe("not_found");
    expect(classifyFailure("A candidate with this email already exists.")).toBe("conflict");
    expect(() => mapActionError(new Error("Candidate not found."))).toThrow(McpToolError);
    expect(() => mapActionError(new Error("boom"))).toThrow("boom");
  });

  it("resolves stages by id or name and rejects ambiguity", () => {
    const stages = [{ id: "a", name: "Applied" }, { id: "b", name: "Interview" }];
    expect(resolveStageRef(stages, { stageName: " interview " }).id).toBe("b");
    expect(resolveStageRef(stages, { stageId: "a" }).name).toBe("Applied");
    expect(() => resolveStageRef(stages, { stageName: "Offer" })).toThrow(/Valid stages/);
    expect(() => resolveStageRef(stages, {})).toThrow();
  });

  it("labels notes written through MCP within the length limit", () => {
    const note = noteWithOrigin("x".repeat(6000), "Claude");
    expect(note.endsWith("(via MCP: Claude)")).toBe(true);
    expect(note.length).toBeLessThanOrEqual(5000);
  });

  it("builds links and consent summaries", () => {
    expect(candidateUrl("https://h.test", "c1", "a1")).toBe("https://h.test/dashboard/candidates/c1?application=a1");
    const summary = summarizeConsent([
      { consentType: "data_processing", granted: true, withdrawnAt: null, createdAt: new Date("2026-01-01") },
      { consentType: "marketing", granted: true, withdrawnAt: new Date("2026-02-01"), createdAt: new Date("2026-01-01") },
    ]);
    expect(summary.dataProcessing.status).toBe("granted");
    expect(summary.marketing.status).toBe("withdrawn");
    expect(summary.aiEvaluation.status).toBe("not_recorded");
  });
});

describe("resume intake", () => {
  it("maps extensions and sniffs content", () => {
    expect(resumeTypeForFileName("cv.PDF")).toBe("application/pdf");
    expect(() => resumeTypeForFileName("cv.png")).toThrow(McpToolError);
    expect(sniffResumeType(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffResumeType(Buffer.from("hello world"))).toBeNull();
  });

  it("decodes base64 including data URLs and rejects garbage", () => {
    const b64 = Buffer.from("%PDF-1.4 test").toString("base64");
    expect(decodeBase64Resume(`data:application/pdf;base64,${b64}`).toString()).toContain("%PDF-");
    expect(() => decodeBase64Resume("not base64!!")).toThrow(McpToolError);
  });

  it("requires exactly one of url or base64", () => {
    expect(resumeInputSchema.safeParse({ fileName: "a.pdf" }).success).toBe(false);
    expect(resumeInputSchema.safeParse({ fileName: "a.pdf", url: "https://x.test/a.pdf", base64: "AAAA" }).success).toBe(false);
    expect(resumeInputSchema.safeParse({ fileName: "a.pdf", url: "https://x.test/a.pdf" }).success).toBe(true);
  });
});
