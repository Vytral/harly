import "server-only";

import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";

import {
  recordIntegrationFailure,
  recordIntegrationSuccess,
} from "@/features/integrations/health/repository";

import { aiFailureForceState, isCallerAbort } from "./health-model";

type HealthRecorder = {
  success: (workspaceId: string, startedAt: Date) => Promise<void>;
  failure: (workspaceId: string, error: unknown) => Promise<void>;
};

const defaultRecorder: HealthRecorder = {
  success: (workspaceId, startedAt) =>
    recordIntegrationSuccess(workspaceId, "ai", { startedAt }),
  failure: (workspaceId, error) =>
    recordIntegrationFailure(workspaceId, "ai", error, {
      forceState: aiFailureForceState(error),
    }),
};

/**
 * Middleware that reports every provider call of a workspace to its `ai`
 * integration health. Many AI surfaces fall back to a non-AI path when the
 * provider fails, so without this a broken model or key goes unnoticed; the
 * stored health is what Settings → AI and the dashboard attention card show.
 * Health writes never throw into the call.
 */
export function aiHealthMiddleware(
  workspaceId: string,
  recorder: HealthRecorder = defaultRecorder,
): LanguageModelMiddleware {
  const fail = (error: unknown) => {
    if (isCallerAbort(error)) return;
    void recorder.failure(workspaceId, error).catch(() => undefined);
  };
  const ok = (startedAt: Date) => {
    void recorder.success(workspaceId, startedAt).catch(() => undefined);
  };

  return {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate }) => {
      const startedAt = new Date();
      try {
        const result = await doGenerate();
        ok(startedAt);
        return result;
      } catch (error) {
        fail(error);
        throw error;
      }
    },
    wrapStream: async ({ doStream }) => {
      const startedAt = new Date();
      let result;
      try {
        result = await doStream();
      } catch (error) {
        fail(error);
        throw error;
      }
      let failed = false;
      const stream = result.stream.pipeThrough(
        new TransformStream({
          transform(part, controller) {
            if (part.type === "error" && !failed) {
              failed = true;
              fail(part.error);
            }
            controller.enqueue(part);
          },
          flush() {
            if (!failed) ok(startedAt);
          },
        }),
      );
      return { ...result, stream };
    },
  };
}

/** Wrap a model so its calls report to the workspace's AI health. */
export function withAiHealth(model: LanguageModel, workspaceId: string | undefined): LanguageModel {
  if (!workspaceId || typeof model === "string" || model.specificationVersion !== "v3") {
    return model;
  }
  return wrapLanguageModel({ model, middleware: aiHealthMiddleware(workspaceId) });
}
