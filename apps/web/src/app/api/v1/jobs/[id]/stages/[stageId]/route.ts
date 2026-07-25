import {
  serializeJobStage,
  updateJobStageForApi,
} from "@/features/pipeline/service";
import { buildRouteHandler } from "@/server/api/contracts";
import { updateJobStageContract } from "@/server/api/contracts/jobs";
import { withApi, apiOk } from "@/server/api/respond";
import { jobStageUpdateSchema } from "@/server/api/schemas";
import type { StageEmailConfig } from "@/features/pipeline/service";

function parseEmailConfig(value: unknown): StageEmailConfig | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value === "object" &&
    value !== null &&
    "candidateUpdatesEnabled" in value &&
    typeof (value as { candidateUpdatesEnabled?: unknown })
      .candidateUpdatesEnabled === "boolean"
  ) {
    return {
      candidateUpdatesEnabled: (value as { candidateUpdatesEnabled: boolean })
        .candidateUpdatesEnabled,
    };
  }
  return undefined;
}

export const runtime = "nodejs";

export const PATCH = withApi(
  buildRouteHandler(updateJobStageContract, async ({ params, body, auth }) => {
    const values = jobStageUpdateSchema.parse(body);
    const stage = await updateJobStageForApi({
      workspaceId: auth.workspaceId,
      jobId: params.id,
      stageId: params.stageId,
      patch: {
        name: values.name,
        color: values.color,
        emailConfig: parseEmailConfig(values.emailConfig),
      },
    });
    return apiOk(serializeJobStage(stage));
  }),
);
