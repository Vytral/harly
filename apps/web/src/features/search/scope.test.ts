import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { candidates } from "@harly/db";

import {
  candidateScopeSql,
  isUnrestrictedScope,
  jobScopeSql,
  jobVisibleUnderScope,
  taskScopeSql,
  type WorkspaceSearchActor,
} from "./scope";

const ALL = { jobAccess: "all" as const, departments: [], regions: [] };
const dialect = new PgDialect();

function actor(scope: WorkspaceSearchActor["scope"]): WorkspaceSearchActor {
  return {
    workspaceId: "ws-1",
    userId: "user-1",
    permissions: ["jobs:view", "candidates:view", "tasks:read", "members:read"],
    scope,
  };
}

function compile(sqlChunk: Parameters<PgDialect["sqlToQuery"]>[0]) {
  return dialect.sqlToQuery(sqlChunk);
}

describe("isUnrestrictedScope", () => {
  it("is unrestricted only when every axis is open", () => {
    expect(isUnrestrictedScope(ALL)).toBe(true);
    expect(isUnrestrictedScope({ ...ALL, departments: ["Eng"] })).toBe(false);
    expect(isUnrestrictedScope({ ...ALL, regions: ["EMEA"] })).toBe(false);
    expect(isUnrestrictedScope({ ...ALL, jobAccess: "assigned" })).toBe(false);
  });
});

describe("jobVisibleUnderScope", () => {
  it("allows every job for an unrestricted scope, even without a department", () => {
    expect(
      jobVisibleUnderScope(ALL, { department: null, region: null }, false),
    ).toBe(true);
  });

  it("matches department case-insensitively and rejects a missing department", () => {
    const scope = { ...ALL, departments: ["engineering"] };
    expect(
      jobVisibleUnderScope(scope, { department: "Engineering", region: null }, false),
    ).toBe(true);
    expect(
      jobVisibleUnderScope(scope, { department: "Sales", region: null }, false),
    ).toBe(false);
    expect(
      jobVisibleUnderScope(scope, { department: null, region: null }, false),
    ).toBe(false);
  });

  it("applies region as its own allow-list alongside department", () => {
    const scope = { ...ALL, departments: ["Engineering"], regions: ["EMEA"] };
    expect(
      jobVisibleUnderScope(scope, { department: "Engineering", region: "emea" }, false),
    ).toBe(true);
    expect(
      jobVisibleUnderScope(scope, { department: "Engineering", region: "APAC" }, false),
    ).toBe(false);
  });

  it("requires hiring-team membership for assigned job access", () => {
    const scope = { ...ALL, jobAccess: "assigned" as const };
    expect(
      jobVisibleUnderScope(scope, { department: null, region: null }, false),
    ).toBe(false);
    expect(
      jobVisibleUnderScope(scope, { department: null, region: null }, true),
    ).toBe(true);
  });

  it("does not let a region match satisfy a department list", () => {
    const scope = { ...ALL, departments: ["Engineering"] };
    expect(
      jobVisibleUnderScope(scope, { department: null, region: "Engineering" }, false),
    ).toBe(false);
  });
});

describe("SQL scope predicates", () => {
  it("emits no predicate for an unrestricted actor", () => {
    expect(jobScopeSql(actor(ALL))).toBeUndefined();
    expect(candidateScopeSql(actor(ALL), candidates.id)).toBeUndefined();
    expect(taskScopeSql(actor(ALL))).toBeUndefined();
  });

  it("restricts jobs with lowercase department and region lists and the assigned check", () => {
    const scope = {
      jobAccess: "assigned" as const,
      departments: ["Engineering"],
      regions: ["EMEA"],
    };
    const { sql: text, params } = compile(jobScopeSql(actor(scope))!);
    expect(text).toContain('lower("jobs"."department") in');
    expect(text).toContain('lower("jobs"."job_location_region") in');
    expect(text).toContain('"job_hiring_team"');
    expect(params).toEqual(
      expect.arrayContaining(["engineering", "emea", "user-1", "ws-1"]),
    );
  });

  it("routes candidate visibility through an in-scope application", () => {
    const { sql: text } = compile(
      candidateScopeSql(actor({ ...ALL, departments: ["Eng"] }), candidates.id)!,
    );
    expect(text.startsWith("(exists (select 1 from")).toBe(true);
    expect(text).toContain('"applications"."candidate_id" = "candidates"."id"');
    expect(text).toContain('"jobs"."deleted_at" is null');
  });

  it("keeps a candidate visible to the restricted user who created it", () => {
    const { sql: text } = compile(
      candidateScopeSql(actor({ ...ALL, departments: ["Eng"] }), candidates.id)!,
    );
    expect(text).toContain("'candidate.created'");
    expect(text).toContain('"audit_logs"."resource_id" = "candidates"."id"::text');
    expect(text).toContain('"audit_logs"."actor_id" =');
  });

  it("keeps owned and created tasks visible alongside the linked-job paths", () => {
    const { sql: text, params } = compile(
      taskScopeSql(actor({ ...ALL, departments: ["Eng"] }))!,
    );
    expect(text).toContain('"tasks"."owner_id" =');
    expect(text).toContain('"tasks"."created_by_id" =');
    expect(text).toContain('"tasks"."job_id"');
    expect(text).toContain('"tasks"."application_id"');
    expect(text).toContain('"tasks"."candidate_id"');
    expect(params).toContain("user-1");
  });
});
