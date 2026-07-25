import {
  deleteCandidateForApi,
  getCandidateForApi,
  serializeCandidate,
  updateCandidateForApi,
} from "@/features/candidates/service";
import { buildRouteHandler } from "@/server/api/contracts";
import {
  deleteCandidateContract,
  getCandidateContract,
  updateCandidateContract,
} from "@/server/api/contracts/candidates";
import { apiOk, withApi } from "@/server/api/respond";
import { candidateUpdateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export const GET = withApi(
  buildRouteHandler(getCandidateContract, async ({ params, auth }) => {
    const candidate = await getCandidateForApi({
      workspaceId: auth.workspaceId,
      candidateId: params.id,
    });
    return apiOk(serializeCandidate(candidate));
  }),
);

export const PATCH = withApi(
  buildRouteHandler(updateCandidateContract, async ({ params, body, auth }) => {
    const values = candidateUpdateSchema.parse(body);
    const candidate = await updateCandidateForApi({
      workspaceId: auth.workspaceId,
      candidateId: params.id,
      values,
    });
    return apiOk(serializeCandidate(candidate));
  }),
);

export const DELETE = withApi(
  buildRouteHandler(deleteCandidateContract, async ({ params, auth }) => {
    await deleteCandidateForApi({
      workspaceId: auth.workspaceId,
      candidateId: params.id,
    });
    return apiOk({ deleted: true });
  }),
);
