"use server";

import { z } from "zod";

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
  const config = await getWorkspaceAiConfig(workspaceId);
  if (!config) {
    return {
      ok: false,
      error: "AI is not configured for this workspace.",
      reason: "not_configured",
    };
  }
  if (!supportsEmbeddings(config)) {
    return {
      ok: false,
      error:
        "Semantic match needs OpenAI as your workspace's AI provider (it uses OpenAI's embedding model). Switch provider in Settings → AI.",
      reason: "unsupported_provider",
    };
  }
  return { ok: true, config };
}

/** Index up to 20 stale/never-embedded candidates. Call repeatedly until `remaining` is 0. */
export async function indexCandidatesForMatchingAction(): Promise<IndexActionResult> {
  const { organization: workspace, roleKey } = await requirePermission("candidates:edit");
  const scope = (await getRolePolicy(workspace.id, roleKey)).scope;
  if (
    scope.jobAccess !== "all" ||
    scope.departments.length > 0 ||
    scope.regions.length > 0
  ) {
    return {
      success: false,
      error: "Semantic indexing requires workspace-wide candidate access.",
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
  const parsed = jobIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input." };

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
      error: "Semantic matching requires workspace-wide candidate access.",
    };
  }

  const resolved = await resolveEmbeddingConfig(workspace.id);
  if (!resolved.ok) return { success: false, error: resolved.error, reason: resolved.reason };

  const candidatePoolCount = await countCandidatePool(workspace.id);
  if (candidatePoolCount === 0) {
    return { success: false, error: "Add candidates to your pool before matching." };
  }

  const unindexed = await countCandidatesNeedingIndex(workspace.id);
  if (unindexed > 0) {
    return {
      success: false,
      error: `${unindexed} candidate${unindexed === 1 ? "" : "s"} not indexed yet. Index the pool first.`,
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
