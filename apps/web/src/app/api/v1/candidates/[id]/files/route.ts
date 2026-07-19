import { listCandidateFilesForApi } from "@/features/candidates/files-service";
import { authenticateApiKey } from "@/server/api/auth";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** GET /api/v1/candidates/:id/files , safe file metadata only. */
export const GET = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "files:read");
  const { id } = await (context as Context).params;
  const files = await listCandidateFilesForApi({
    workspaceId: ctx.workspaceId,
    candidateId: id,
  });
  return apiOk(files);
});
