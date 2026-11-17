import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, member, user } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { listScimUsers, ScimError, upsertScimUser } from "./service";

const BASE = "https://example.test/api/scim/v2.0/ws";

describe.skipIf(!runPipelineIntegration)("SCIM users", () => {
  let fx: PipelineFixture;
  const extraUserIds: string[] = [];

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    for (const id of extraUserIds) await db.delete(user).where(eq(user.id, id));
    await fx?.cleanup();
  });

  it("creates, then answers 409 for a duplicate POST", async () => {
    const email = `scim-${fx.workspaceId}@example.test`;
    const created = await upsertScimUser(
      fx.workspaceId,
      { userName: email, externalId: "ext-1", displayName: "Scim One" },
      BASE,
      { mode: "create" },
    );
    extraUserIds.push(
      (await db.select({ id: member.userId }).from(member).where(eq(member.id, created.id)))[0]!.id,
    );
    for (const input of [
      { userName: email.toUpperCase() },
      { userName: "other@example.test", externalId: "ext-1" },
    ]) {
      await expect(
        upsertScimUser(fx.workspaceId, input, BASE, { mode: "create" }),
      ).rejects.toMatchObject({ status: 409, scimType: "uniqueness" });
    }
  });

  it("matches userName exactly (no wildcards) and supports externalId", async () => {
    const email = `scim-${fx.workspaceId}@example.test`;
    const exact = await listScimUsers(fx.workspaceId, BASE, 1, 10, `userName eq "${email.toUpperCase()}"`);
    expect(exact.totalResults).toBe(1);
    const wildcard = await listScimUsers(fx.workspaceId, BASE, 1, 10, 'userName eq "%@example.test"');
    expect(wildcard.totalResults).toBe(0);
    const byExternal = await listScimUsers(fx.workspaceId, BASE, 1, 10, 'externalId eq "ext-1"');
    expect(byExternal.totalResults).toBe(1);
    await expect(
      listScimUsers(fx.workspaceId, BASE, 1, 10, 'userName co "a"'),
    ).rejects.toBeInstanceOf(ScimError);
  });

  it("refuses to attach an account that exists outside the workspace", async () => {
    await expect(
      upsertScimUser(fx.workspaceId, { userName: `fixture-${fx.workspaceId.slice(8)}@example.test` }, BASE, { mode: "create" }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
