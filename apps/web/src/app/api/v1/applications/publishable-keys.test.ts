import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  moveApplicationStageForApi: vi.fn(),
  rejectApplicationForApi: vi.fn(),
  hireApplicationForApi: vi.fn(),
  createApplicationsBulkForApi: vi.fn(),
  createApplicationForApi: vi.fn(),
  after: vi.fn(),
  scheduleAutoScore: vi.fn(),
  scheduleAutoDuplicateCheck: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/server/api/auth", () => ({
  authenticateApiKey: mocks.authenticate,
  hasApiScope: (scopes: string[], scope: string) => scopes.includes(scope),
  requireScope: vi.fn(),
  getRequestRateLimit: () => null,
}));
vi.mock("@/server/api/idempotency", () => ({
  reserveIdempotencyKey: vi.fn(async () => ({ kind: "not_requested" })),
  releaseIdempotencyReservation: vi.fn(async () => undefined),
}));
vi.mock("@/server/observability/metrics", () => ({
  recordHttpError: vi.fn(),
  recordHttpRequest: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/features/applications/service", () => ({
  moveApplicationStageForApi: mocks.moveApplicationStageForApi,
  rejectApplicationForApi: mocks.rejectApplicationForApi,
  hireApplicationForApi: mocks.hireApplicationForApi,
  createApplicationsBulkForApi: mocks.createApplicationsBulkForApi,
  createApplicationForApi: mocks.createApplicationForApi,
  serializeApplication: (application: { id: string }) => ({ id: application.id }),
}));
vi.mock("@/features/applications/auto-score", () => ({
  scheduleAutoScore: mocks.scheduleAutoScore,
}));
vi.mock("@/features/applications/auto-duplicates", () => ({
  scheduleAutoDuplicateCheck: mocks.scheduleAutoDuplicateCheck,
}));

import { POST as createPost } from "./route";
import { POST as movePost } from "./[id]/move/route";
import { POST as rejectPost } from "./[id]/reject/route";
import { POST as hirePost } from "./[id]/hire/route";
import { POST as bulkPost } from "./bulk/route";

const APPLICATION_ID = "123e4567-e89b-12d3-a456-426614174000";
const JOB_ID = "223e4567-e89b-12d3-a456-426614174000";
const CANDIDATE_ID = "323e4567-e89b-12d3-a456-426614174000";
const STAGE_ID = "423e4567-e89b-12d3-a456-426614174000";

function asKey(type: "publishable" | "secret", scopes = ["applications:write"]) {
  mocks.authenticate.mockResolvedValue({
    workspaceId: "ws-1",
    keyId: `key-${type}`,
    createdById: null,
    type,
    environment: "test",
    scopes,
    rateLimit: { limit: 1000, remaining: 999, resetAt: 0 },
  });
}

function jsonRequest(url: string, body?: unknown) {
  return new Request(url, {
    method: "POST",
    headers: {
      authorization: "Bearer harly_pk_live_test_publishable",
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const applicationRow = {
  id: APPLICATION_ID,
  candidateId: CANDIDATE_ID,
  jobId: JOB_ID,
  currentStageId: STAGE_ID,
  status: "active",
  source: null,
  pipelineOrder: 0,
  appliedAt: null,
  createdAt: new Date("2026-01-10T14:00:00.000Z"),
  updatedAt: new Date("2026-01-10T14:00:00.000Z"),
};

const params = (id = APPLICATION_ID) => ({ params: Promise.resolve({ id }) });

describe("publishable keys cannot change application state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.moveApplicationStageForApi.mockResolvedValue(applicationRow);
    mocks.rejectApplicationForApi.mockResolvedValue(applicationRow);
    mocks.hireApplicationForApi.mockResolvedValue(applicationRow);
    mocks.createApplicationsBulkForApi.mockResolvedValue([
      { outcome: "created", candidateId: CANDIDATE_ID, application: applicationRow },
    ]);
    mocks.createApplicationForApi.mockResolvedValue(applicationRow);
  });

  it("rejects a publishable key on move with 403 before the service runs", async () => {
    asKey("publishable");
    const response = await movePost(
      jsonRequest(`https://example.test/api/v1/applications/${APPLICATION_ID}/move`, {
        toStageId: STAGE_ID,
      }),
      params(),
    );
    expect(response.status).toBe(403);
    expect(mocks.moveApplicationStageForApi).not.toHaveBeenCalled();
  });

  it("rejects a publishable key on reject with 403 before the service runs", async () => {
    asKey("publishable");
    const response = await rejectPost(
      jsonRequest(`https://example.test/api/v1/applications/${APPLICATION_ID}/reject`),
      params(),
    );
    expect(response.status).toBe(403);
    expect(mocks.rejectApplicationForApi).not.toHaveBeenCalled();
  });

  it("rejects a publishable key on hire with 403 before the service runs", async () => {
    asKey("publishable");
    const response = await hirePost(
      jsonRequest(`https://example.test/api/v1/applications/${APPLICATION_ID}/hire`),
      params(),
    );
    expect(response.status).toBe(403);
    expect(mocks.hireApplicationForApi).not.toHaveBeenCalled();
  });

  it("rejects a publishable key on bulk create with 403 before the service runs", async () => {
    asKey("publishable");
    const response = await bulkPost(
      jsonRequest("https://example.test/api/v1/applications/bulk", {
        jobId: JOB_ID,
        candidateIds: [CANDIDATE_ID],
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.createApplicationsBulkForApi).not.toHaveBeenCalled();
  });

  it("still lets a publishable key create an application (public widget flow)", async () => {
    asKey("publishable");
    const response = await createPost(
      jsonRequest("https://example.test/api/v1/applications", {
        jobId: JOB_ID,
        candidateId: CANDIDATE_ID,
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.createApplicationForApi).toHaveBeenCalledTimes(1);
  });

  it("keeps secret keys working for move, reject, hire and bulk", async () => {
    asKey("secret");
    const move = await movePost(
      jsonRequest(`https://example.test/api/v1/applications/${APPLICATION_ID}/move`, {
        toStageId: STAGE_ID,
      }),
      params(),
    );
    expect(move.status).toBe(200);

    const reject = await rejectPost(
      jsonRequest(`https://example.test/api/v1/applications/${APPLICATION_ID}/reject`),
      params(),
    );
    expect(reject.status).toBe(200);

    const hire = await hirePost(
      jsonRequest(`https://example.test/api/v1/applications/${APPLICATION_ID}/hire`),
      params(),
    );
    expect(hire.status).toBe(200);

    const bulk = await bulkPost(
      jsonRequest("https://example.test/api/v1/applications/bulk", {
        jobId: JOB_ID,
        candidateIds: [CANDIDATE_ID],
      }),
    );
    expect(bulk.status).toBe(201);

    expect(mocks.moveApplicationStageForApi).toHaveBeenCalledTimes(1);
    expect(mocks.rejectApplicationForApi).toHaveBeenCalledTimes(1);
    expect(mocks.hireApplicationForApi).toHaveBeenCalledTimes(1);
    expect(mocks.createApplicationsBulkForApi).toHaveBeenCalledTimes(1);
  });
});
