import { listCandidateFilesForApi } from "@/features/candidates/files-service";
import { buildRouteHandler } from "@/server/api/contracts";
import { listCandidateFilesContract } from "@/server/api/contracts/candidates";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(listCandidateFilesContract, async ({ params, auth }) => {
    const files = await listCandidateFilesForApi({
      workspaceId: auth.workspaceId,
      candidateId: params.id,
    });
    return apiOk(files);
  }),
);
