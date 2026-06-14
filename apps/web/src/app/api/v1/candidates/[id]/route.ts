import {
  deleteCandidateForApi,
  getCandidateForApi,
  serializeCandidate,
  updateCandidateForApi,
} from "@/features/candidates/service";
import { authenticateApiKey } from "@/server/api/auth";
import { candidateUpdateSchema } from "@/server/api/schemas";
import { apiOk, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "candidates:read");
  const { id } = await (context as Context).params;
  const candidate = await getCandidateForApi({
    workspaceId: ctx.workspaceId,
    candidateId: id,
  });
  return apiOk(serializeCandidate(candidate));
});

export const PATCH = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "candidates:write");
  const { id } = await (context as Context).params;
  const values = candidateUpdateSchema.parse(
    await request.json().catch(() => null),
  );
  const candidate = await updateCandidateForApi({
    workspaceId: ctx.workspaceId,
    candidateId: id,
    values,
  });
  return apiOk(serializeCandidate(candidate));
});

export const DELETE = withApi(async (request, context) => {
  const ctx = await authenticateApiKey(request, "candidates:write");
  const { id } = await (context as Context).params;
  await deleteCandidateForApi({
    workspaceId: ctx.workspaceId,
    candidateId: id,
  });
  return apiOk({ deleted: true });
});
