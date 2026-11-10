"use server";

import { z } from "zod";
import { getTranslations } from "@/i18n/server";

import {
  getRolePolicy,
  requireJobPermission,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { supportsEmbeddings } from "@/lib/ai/embeddings";
import { SEMANTIC_MATCH_LIMIT } from "@/features/matching/constants";
import {
  countCandidatePool,
  countCandidatesNeedingIndex,
  indexCandidateBatch,
  matchCandidatesForJob,
  type IndexBatchResult,
  type JobMatch,
} from "@/features/matching/data";

type NotConfiguredReason = "not_configured" | "unsupported_provider";

export type MatchActionResult =
  | { success: true; matches: JobMatch[] }
  | { success: false; error: string; reason?: NotConfiguredReason };

export type IndexActionResult =
  | { success: true; result: IndexBatchResult }
  | { success: false; error: string; reason?: NotConfiguredReason };

const jobIdSchema = z.object({ jobId: z.uuid() });

type ConfigResolution =
  | { ok: true; config: NonNullable<Awaited<ReturnType<typeof getWorkspaceAiConfig>>> }
  | { ok: false; error: string; reason: NotConfiguredReason };

async function resolveEmbeddingConfig(workspaceId: string): Promise<ConfigResolution> {
  const t = await getTranslations("server.matching.actions");
  const config = await getWorkspaceAiConfig(workspaceId);
  if (!config) {
    return {
      ok: false,
      error: t("aiNotConfigured"),
      reason: "not_configured",
    };
  }
  if (!supportsEmbeddings(config)) {
    return {
      ok: false,
      error:
        t("needsOpenAiProvider"),
      reason: "unsupported_provider",
    };
  }
  return { ok: true, config };
}

/** Index up to 20 stale/never-embedded candidates. Call repeatedly until `remaining` is 0. */
export async function indexCandidatesForMatchingAction(): Promise<IndexActionResult> {
  const t = await getTranslations("server.matching.actions");
  const { organization: workspace, roleKey } = await requirePermission("candidates:edit");
  const scope = (await getRolePolicy(workspace.id, roleKey)).scope;
  if (
    scope.jobAccess !== "all" ||
    scope.departments.length > 0 ||
    scope.regions.length > 0
  ) {
    return {
      success: false,
      error: t("indexingNeedsAccess"),
    };
  }

  const resolved = await resolveEmbeddingConfig(workspace.id);
  if (!resolved.ok) return { success: false, error: resolved.error, reason: resolved.reason };

  const result = await indexCandidateBatch(resolved.config, workspace.id, 20);
  return { success: true, result };
}

/** Rank the whole candidate pool against a job by semantic similarity. */
export async function generateJobMatchesAction(
  input: z.infer<typeof jobIdSchema>,
): Promise<MatchActionResult> {
  const t = await getTranslations("server.matching.actions");
  const parsed = jobIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: t("invalidInput") };

  const { organization: workspace, roleKey } = await requireJobPermission(
    "candidates:edit",
    parsed.data.jobId,
  );
  const scope = (await getRolePolicy(workspace.id, roleKey)).scope;
  if (
    scope.jobAccess !== "all" ||
    scope.departments.length > 0 ||
    scope.regions.length > 0
  ) {
    return {
      success: false,
      error: t("matchingNeedsAccess"),
    };
  }

  const resolved = await resolveEmbeddingConfig(workspace.id);
  if (!resolved.ok) return { success: false, error: resolved.error, reason: resolved.reason };

  const candidatePoolCount = await countCandidatePool(workspace.id);
  if (candidatePoolCount === 0) {
    return { success: false, error: t("addCandidatesFirst") };
  }

  const unindexed = await countCandidatesNeedingIndex(workspace.id);
  if (unindexed > 0) {
    return {
      success: false,
      error: t("notIndexed", { count: unindexed }),
    };
  }

  const matches = await matchCandidatesForJob(
    resolved.config,
    workspace.id,
    parsed.data.jobId,
    SEMANTIC_MATCH_LIMIT,
  );
  return { success: true, matches };
}
