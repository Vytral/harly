import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  actor: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  reorder: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/server/api/auth", () => ({
  authenticateApiKey: mocks.authenticate,
  hasApiScope: (scopes: string[], scope: string) => scopes.includes(scope),
  getRequestRateLimit: vi.fn(() => null),
}));

vi.mock("@/server/api/actor", () => ({
  resolveWorkspaceActorUserId: mocks.actor,
}));

vi.mock("@/server/api/idempotency", () => ({
  reserveIdempotencyKey: vi.fn(async () => ({ kind: "not_requested" })),
  releaseIdempotencyReservation: vi.fn(async () => undefined),
}));

vi.mock("@/features/pipeline/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/pipeline/service")>()),
  listJobStagesForApi: mocks.list,
  createJobStageForApi: mocks.create,
  updateJobStageForApi: mocks.update,
  reorderJobStagesForApi: mocks.reorder,
  archiveJobStageForApi: mocks.archive,
  deleteJobStageForApi: mocks.remove,
}));

import { ApiError } from "@harly/api";

import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[stageId]/route";
import { POST as ARCHIVE } from "./[stageId]/archive/route";
import { POST as REORDER } from "./reorder/route";
import {
  archiveJobStageContract,
  createJobStageContract,
  deleteJobStageContract,
  listJobStagesContract,
  reorderJobStagesContract,
  updateJobStageContract,
  validateRouteResponse,
} from "@/server/api/contracts";

const JOB_ID = "55555555-5555-4555-8555-555555555555";
const STAGE_ID = "66666666-6666-4666-8666-666666666666";
const OTHER_STAGE_ID = "77777777-7777-4777-8777-777777777777";

function stageSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: STAGE_ID,
    workspaceId: "ws-1",
    jobId: JOB_ID,
    name: "Interview",
    color: "#FEF3C7",
    order: 2,
    kind: "interview",
    archivedAt: null,
    applicationCount: 4,
    emailConfig: { candidateUpdatesEnabled: true },
    createdAt: new Date("2026-01-10T14:00:00.000Z"),
    updatedAt: new Date("2026-01-10T14:00:00.000Z"),
    ...overrides,
  };
}

function authWith(scopes: string[]) {
  mocks.authenticate.mockResolvedValue({
    workspaceId: "ws-1",
    keyId: "key-1",
    createdById: "user-1",
    type: "secret",
    scopes,
  });
}

function json(body: unknown, method = "POST") {
  return new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const jobContext = { params: Promise.resolve({ id: JOB_ID }) };
const stageContext = { params: Promise.resolve({ id: JOB_ID, stageId: STAGE_ID }) };

describe("job stage REST routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue("user-1");
    mocks.list.mockResolvedValue([stageSummary()]);
    mocks.create.mockResolvedValue(stageSummary({ name: "Panel", kind: "custom" }));
    mocks.update.mockResolvedValue(stageSummary());
    mocks.reorder.mockResolvedValue([stageSummary()]);
    mocks.archive.mockResolvedValue({
      stage: stageSummary({ archivedAt: new Date("2026-02-01T00:00:00.000Z") }),
      movedApplications: 4,
    });
    mocks.remove.mockResolvedValue(undefined);
  });

  describe("GET /stages", () => {
    it("requires stages:read and hides archived stages unless asked", async () => {
      authWith(["stages:read"]);

      const response = await GET(
        new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages`),
        jobContext,
      );
      const body = await validateRouteResponse(listJobStagesContract, response, 200);

      expect(body.data[0]).toMatchObject({ kind: "interview", archivedAt: null });
      expect(mocks.list).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        jobId: JOB_ID,
        includeArchived: false,
      });
    });

    it("includes archived stages when includeArchived=true", async () => {
      authWith(["stages:read"]);

      await GET(
        new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages?includeArchived=true`),
        jobContext,
      );

      expect(mocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ includeArchived: true }),
      );
    });

    it("rejects keys without stages:read", async () => {
      // The real authenticateApiKey enforces the contract's first scope.
      mocks.authenticate.mockRejectedValue(
        ApiError.forbidden("This key is missing the `stages:read` scope."),
      );

      const response = await GET(
        new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages`),
        jobContext,
      );

      expect(response.status).toBe(403);
      expect(mocks.list).not.toHaveBeenCalled();
    });
  });

  describe("POST /stages", () => {
    it("creates a stage, forwards kind and position, and returns 201", async () => {
      authWith(["stages:write"]);

      const response = await POST(
        json({ name: "Panel", kind: "custom", position: 4 }),
        jobContext,
      );
      const body = await validateRouteResponse(createJobStageContract, response, 201);

      expect(body.data.name).toBe("Panel");
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          jobId: JOB_ID,
          actorUserId: "user-1",
          name: "Panel",
          kind: "custom",
          position: 4,
        }),
      );
    });

    it("answers invalid bodies with 422 before calling the service", async () => {
      authWith(["stages:write"]);

      const response = await POST(json({ name: "Panel", kind: "accepted" }), jobContext);

      expect(response.status).toBe(422);
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("refuses writes when the API key has no owner to attribute them to", async () => {
      authWith(["stages:write"]);
      mocks.actor.mockResolvedValue(null);

      const response = await POST(json({ name: "Panel" }), jobContext);

      expect(response.status).toBe(422);
      expect(mocks.create).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /stages/{stageId}", () => {
    it("forwards kind and a valid email config, and drops position", async () => {
      authWith(["stages:write"]);

      const response = await PATCH(
        new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages/${STAGE_ID}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "offer",
            position: 0,
            emailConfig: { candidateUpdatesEnabled: false },
          }),
        }),
        stageContext,
      );
      await validateRouteResponse(updateJobStageContract, response, 200);

      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          stageId: STAGE_ID,
          patch: {
            name: undefined,
            color: undefined,
            kind: "offer",
            emailConfig: { candidateUpdatesEnabled: false },
          },
        }),
      );
      expect(mocks.update.mock.calls[0]?.[0]).not.toHaveProperty("position");
    });

    it("ignores a malformed email config instead of overwriting the stored one", async () => {
      authWith(["stages:write"]);

      await PATCH(
        new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages/${STAGE_ID}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Panel", emailConfig: { candidateUpdatesEnabled: "no" } }),
        }),
        stageContext,
      );

      expect(mocks.update.mock.calls[0]?.[0].patch.emailConfig).toBeUndefined();
    });

    it("maps a service conflict to a 409 envelope", async () => {
      authWith(["stages:write"]);
      mocks.update.mockRejectedValue(
        ApiError.conflict("This stage holds 2 application(s)."),
      );

      const response = await PATCH(
        new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages/${STAGE_ID}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "hired" }),
        }),
        stageContext,
      );

      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("conflict");
    });
  });

  describe("DELETE /stages/{stageId}", () => {
    it("deletes an unused stage and returns success", async () => {
      authWith(["stages:write"]);

      const response = await DELETE(
        new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages/${STAGE_ID}`, {
          method: "DELETE",
        }),
        stageContext,
      );
      const body = await validateRouteResponse(deleteJobStageContract, response, 200);

      expect(body.data).toEqual({ success: true });
      expect(mocks.remove).toHaveBeenCalledWith(
        expect.objectContaining({ stageId: STAGE_ID, jobId: JOB_ID }),
      );
    });

    it("maps a not-found stage to 404", async () => {
      authWith(["stages:write"]);
      mocks.remove.mockRejectedValue(ApiError.notFound("Job stage not found."));

      const response = await DELETE(
        new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages/${STAGE_ID}`, {
          method: "DELETE",
        }),
        stageContext,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /stages/reorder", () => {
    it("forwards the ordered ids and returns active stages", async () => {
      authWith(["stages:write"]);

      const response = await REORDER(
        new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages/reorder`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stageIds: [OTHER_STAGE_ID, STAGE_ID] }),
        }),
        jobContext,
      );
      const body = await validateRouteResponse(reorderJobStagesContract, response, 200);

      expect(body.data).toHaveLength(1);
      expect(mocks.reorder).toHaveBeenCalledWith(
        expect.objectContaining({ stageIds: [OTHER_STAGE_ID, STAGE_ID] }),
      );
    });

    it("rejects an empty stageIds list with 422", async () => {
      authWith(["stages:write"]);

      const response = await REORDER(
        new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages/reorder`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stageIds: [] }),
        }),
        jobContext,
      );

      expect(response.status).toBe(422);
      expect(mocks.reorder).not.toHaveBeenCalled();
    });
  });

  describe("POST /stages/{stageId}/archive", () => {
    it("archives with a merge target and reports how many applications moved", async () => {
      authWith(["stages:write"]);

      const response = await ARCHIVE(
        new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages/${STAGE_ID}/archive`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mergeIntoStageId: OTHER_STAGE_ID }),
        }),
        stageContext,
      );
      const body = await validateRouteResponse(archiveJobStageContract, response, 200);

      expect(body.data.movedApplications).toBe(4);
      expect(body.data.stage.archivedAt).toBe("2026-02-01T00:00:00.000Z");
      expect(mocks.archive).toHaveBeenCalledWith(
        expect.objectContaining({ mergeIntoStageId: OTHER_STAGE_ID }),
      );
    });

    it("treats a missing body as no merge target", async () => {
      authWith(["stages:write"]);

      await ARCHIVE(
        new Request(`https://example.test/api/v1/jobs/${JOB_ID}/stages/${STAGE_ID}/archive`, {
          method: "POST",
        }),
        stageContext,
      );

      expect(mocks.archive).toHaveBeenCalledWith(
        expect.objectContaining({ mergeIntoStageId: null }),
      );
    });
  });
});
