import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/integrations/health/repository", () => ({
  recordIntegrationFailure: vi.fn(),
  recordIntegrationSuccess: vi.fn(),
}));

import { aiHealthMiddleware } from "./health";
import { aiFailureForceState, isCallerAbort } from "./health-model";

function recorder() {
  return {
    success: vi.fn(async () => undefined),
    failure: vi.fn(async () => undefined),
  };
}

type Middleware = ReturnType<typeof aiHealthMiddleware>;
type GenerateArgs = Parameters<NonNullable<Middleware["wrapGenerate"]>>[0];
type StreamArgs = Parameters<NonNullable<Middleware["wrapStream"]>>[0];

describe("aiHealthMiddleware", () => {
  it("records a success after a generate call", async () => {
    const rec = recorder();
    const middleware = aiHealthMiddleware("ws-1", rec);
    const result = await middleware.wrapGenerate!({
      doGenerate: async () => ({ content: [] }),
    } as unknown as GenerateArgs);
    expect(result).toEqual({ content: [] });
    expect(rec.success).toHaveBeenCalledWith("ws-1", expect.any(Date));
    expect(rec.failure).not.toHaveBeenCalled();
  });

  it("records the provider error and rethrows it", async () => {
    const rec = recorder();
    const middleware = aiHealthMiddleware("ws-1", rec);
    const error = Object.assign(new Error("tool_choice not supported"), { statusCode: 400 });
    await expect(
      middleware.wrapGenerate!({
        doGenerate: async () => {
          throw error;
        },
      } as unknown as GenerateArgs),
    ).rejects.toBe(error);
    expect(rec.failure).toHaveBeenCalledWith("ws-1", error);
    expect(rec.success).not.toHaveBeenCalled();
  });

  it("does not record a call the caller aborted", async () => {
    const rec = recorder();
    const middleware = aiHealthMiddleware("ws-1", rec);
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    await expect(
      middleware.wrapGenerate!({
        doGenerate: async () => {
          throw abort;
        },
      } as unknown as GenerateArgs),
    ).rejects.toBe(abort);
    expect(rec.failure).not.toHaveBeenCalled();
  });

  it("records a stream error part as a failure and a clean stream as a success", async () => {
    const run = async (parts: unknown[]) => {
      const rec = recorder();
      const middleware = aiHealthMiddleware("ws-1", rec);
      const { stream } = await middleware.wrapStream!({
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              for (const part of parts) controller.enqueue(part);
              controller.close();
            },
          }),
        }),
      } as unknown as StreamArgs);
      const reader = stream.getReader();
      while (!(await reader.read()).done) {
        // drain
      }
      return rec;
    };

    const failed = await run([{ type: "error", error: new Error("boom") }]);
    expect(failed.failure).toHaveBeenCalledTimes(1);
    expect(failed.success).not.toHaveBeenCalled();

    const clean = await run([{ type: "text-delta", id: "1", delta: "hi" }]);
    expect(clean.success).toHaveBeenCalledTimes(1);
    expect(clean.failure).not.toHaveBeenCalled();
  });
});

describe("health-model", () => {
  it("puts rejected requests straight into the error state", () => {
    expect(aiFailureForceState({ statusCode: 400 })).toBe("error");
    expect(aiFailureForceState({ statusCode: 404 })).toBe("error");
    expect(aiFailureForceState({ statusCode: 500 })).toBeUndefined();
    expect(aiFailureForceState({ statusCode: 401 })).toBeUndefined();
    expect(aiFailureForceState(new Error("x"))).toBeUndefined();
  });

  it("only treats AbortError as a caller abort", () => {
    expect(isCallerAbort(Object.assign(new Error(), { name: "AbortError" }))).toBe(true);
    expect(isCallerAbort(Object.assign(new Error(), { name: "TimeoutError" }))).toBe(false);
  });
});
