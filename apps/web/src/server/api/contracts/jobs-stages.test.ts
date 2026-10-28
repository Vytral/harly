import { describe, expect, it } from "vitest";

import { STAGE_KINDS } from "@harly/db/stage-kind";
import {
  jobStageArchiveSchema,
  jobStageCreateSchema,
  jobStageKindSchema,
  jobStageReorderSchema,
  jobStageUpdateSchema,
} from "@harly/validators";

import {
  archiveJobStageContract,
  createJobStageContract,
  deleteJobStageContract,
  listJobStagesContract,
  reorderJobStagesContract,
  updateJobStageContract,
} from "./jobs";

const STAGE_ID = "11111111-1111-4111-8111-111111111111";

describe("stage kind schema", () => {
  it("accepts exactly the kinds the database layer defines", () => {
    expect([...jobStageKindSchema.options]).toEqual([...STAGE_KINDS]);
  });
});

describe("stage request schemas", () => {
  it("creates with a name and optional kind, color and position", () => {
    expect(
      jobStageCreateSchema.parse({
        name: "  Technical loop  ",
        kind: "interview",
        color: "#FEF3C7",
        position: 2,
      }),
    ).toEqual({
      name: "Technical loop",
      kind: "interview",
      color: "#FEF3C7",
      position: 2,
    });
  });

  it("rejects unknown kinds, blank names and negative positions on create", () => {
    expect(() => jobStageCreateSchema.parse({ name: "X", kind: "accepted" })).toThrow();
    expect(() => jobStageCreateSchema.parse({ name: "   " })).toThrow();
    expect(() => jobStageCreateSchema.parse({ name: "X", position: -1 })).toThrow();
  });

  it("does not let PATCH move a stage: position is not part of the update schema", () => {
    const parsed = jobStageUpdateSchema.parse({ name: "Renamed", position: 0, kind: "offer" });
    expect(parsed).toEqual({ name: "Renamed", kind: "offer" });
    expect(parsed).not.toHaveProperty("position");
  });

  it("requires a non-empty list of stage uuids for reorder", () => {
    expect(jobStageReorderSchema.parse({ stageIds: [STAGE_ID] })).toEqual({
      stageIds: [STAGE_ID],
    });
    expect(() => jobStageReorderSchema.parse({ stageIds: [] })).toThrow();
    expect(() => jobStageReorderSchema.parse({ stageIds: ["not-a-uuid"] })).toThrow();
  });

  it("accepts an optional merge target on archive, including null", () => {
    expect(jobStageArchiveSchema.parse({})).toEqual({});
    expect(jobStageArchiveSchema.parse({ mergeIntoStageId: null })).toEqual({
      mergeIntoStageId: null,
    });
    expect(
      jobStageArchiveSchema.parse({ mergeIntoStageId: STAGE_ID }),
    ).toEqual({ mergeIntoStageId: STAGE_ID });
    expect(() => jobStageArchiveSchema.parse({ mergeIntoStageId: "x" })).toThrow();
  });
});

describe("stage contracts", () => {
  it("declares the stage endpoints with the documented methods, paths and scopes", () => {
    expect(listJobStagesContract).toMatchObject({
      method: "GET",
      path: "/api/v1/jobs/{id}/stages",
      auth: { scopes: ["stages:read"] },
    });
    expect(createJobStageContract).toMatchObject({
      method: "POST",
      path: "/api/v1/jobs/{id}/stages",
      auth: { scopes: ["stages:write"] },
      idempotent: true,
    });
    expect(updateJobStageContract).toMatchObject({
      method: "PATCH",
      path: "/api/v1/jobs/{id}/stages/{stageId}",
      idempotent: true,
    });
    expect(reorderJobStagesContract).toMatchObject({
      method: "POST",
      path: "/api/v1/jobs/{id}/stages/reorder",
      idempotent: true,
    });
    expect(archiveJobStageContract).toMatchObject({
      method: "POST",
      path: "/api/v1/jobs/{id}/stages/{stageId}/archive",
      idempotent: true,
    });
    expect(deleteJobStageContract).toMatchObject({
      method: "DELETE",
      path: "/api/v1/jobs/{id}/stages/{stageId}",
      auth: { scopes: ["stages:write"] },
    });
  });

  it("gives every stage operation a unique operationId", () => {
    const ids = [
      listJobStagesContract,
      createJobStageContract,
      updateJobStageContract,
      reorderJobStagesContract,
      archiveJobStageContract,
      deleteJobStageContract,
    ].map((contract) => contract.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("documents the includeArchived query flag on the list endpoint", () => {
    expect(listJobStagesContract.parameters.query.parse({ includeArchived: "true" })).toEqual({
      includeArchived: "true",
    });
    expect(() =>
      listJobStagesContract.parameters.query.parse({ includeArchived: "yes" }),
    ).toThrow();
  });
});
