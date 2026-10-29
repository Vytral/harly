import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { customRoles, db, documentAccessRoles, documentAssociations, documents } from "@harly/db";

import {
  createAuthorizationFixture,
  type ActorKey,
  type AuthorizationFixture,
} from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

const ctx = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  roleKey: "owner",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: ctx.workspaceId, name: "Auth", slug: "auth" },
    user: { id: ctx.userId, email: "auth@example.test", name: "Auth User", image: null },
    membership: { id: "member", role: ctx.roleKey },
    role: ctx.roleKey,
    roleKey: ctx.roleKey,
    session: {},
  })),
  getWorkspaceContextOrNull: vi.fn(async () => null),
}));

import { getDocumentAccess, getDocumentHubData } from "./data";

describe.skipIf(!runPipelineIntegration)("documents respect candidate and job scope (database)", () => {
  let fx: AuthorizationFixture;
  let scopedRoleKey: string;
  let fullRoleKey: string;
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = key === "scoped" ? scopedRoleKey : fullRoleKey;
  }

  async function makeDocument(
    label: string,
    options: {
      ownerId?: string;
      associations?: Array<{ targetType: string; targetId: string | null }>;
      aclRoleKey?: string;
    } = {},
  ) {
    const [row] = await db
      .insert(documents)
      .values({
        workspaceId: fx.workspaceId,
        name: `Doc ${label} ${tag}`,
        originalName: `${label}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 10,
        checksum: randomUUID(),
        storageKey: `documents/${randomUUID()}.pdf`,
        ownerId: options.ownerId ?? fx.users.full,
        createdById: fx.users.full,
      })
      .returning({ id: documents.id });
    ids[label] = row!.id;
    if (options.associations?.length) {
      await db.insert(documentAssociations).values(
        options.associations.map((association) => ({
          workspaceId: fx.workspaceId,
          documentId: row!.id,
          targetType: association.targetType,
          targetId: association.targetId,
          createdById: fx.users.full,
        })),
      );
    }
    if (options.aclRoleKey) {
      await db.insert(documentAccessRoles).values({
        workspaceId: fx.workspaceId,
        documentId: row!.id,
        roleKey: options.aclRoleKey,
        accessLevel: "read",
      });
    }
    return row!.id;
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    scopedRoleKey = `doc-scoped-${tag}`;
    fullRoleKey = `doc-full-${tag}`;
    await db.insert(customRoles).values([
      {
        workspaceId: fx.workspaceId,
        key: scopedRoleKey,
        name: "Documents, assigned jobs",
        permissions: ["candidates:view", "jobs:view", "documents:read"],
        scope: { jobAccess: "assigned", departments: [], regions: [] },
      },
      {
        workspaceId: fx.workspaceId,
        key: fullRoleKey,
        name: "Documents, all jobs",
        permissions: ["candidates:view", "jobs:view", "documents:read"],
        scope: { jobAccess: "all", departments: [], regions: [] },
      },
    ]);

    await makeDocument("candidateBOnly", {
      associations: [{ targetType: "candidate", targetId: fx.candidateB }],
    });
    await makeDocument("mixed", {
      associations: [
        { targetType: "candidate", targetId: fx.candidateA },
        { targetType: "candidate", targetId: fx.candidateB },
      ],
    });
    await makeDocument("jobBOnly", {
      associations: [{ targetType: "job", targetId: fx.jobB }],
    });
    await makeDocument("workspace", {});
    await makeDocument("aclGrantedOnB", {
      associations: [{ targetType: "candidate", targetId: fx.candidateB }],
      aclRoleKey: scopedRoleKey,
    });
    await makeDocument("ownedByScopedOnB", {
      ownerId: fx.users.scoped,
      associations: [{ targetType: "candidate", targetId: fx.candidateB }],
    });
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("hides a document whose only associations are outside a scoped caller's scope", async () => {
    actAs("scoped");
    const hub = await getDocumentHubData();
    const visible = hub.documents.map((doc) => doc.id);
    expect(visible).not.toContain(ids.candidateBOnly);
    expect(visible).not.toContain(ids.jobBOnly);
    expect(await getDocumentAccess(ids.candidateBOnly)).toBeNull();
    expect(await getDocumentAccess(ids.jobBOnly)).toBeNull();
  });

  it("keeps a document visible to a scoped caller but shows only in-scope association labels and ids", async () => {
    actAs("scoped");
    const hub = await getDocumentHubData();
    const mixed = hub.documents.find((doc) => doc.id === ids.mixed);
    expect(mixed).toBeDefined();
    expect(mixed!.associationLabels).toEqual(["Candidate"]);
    expect(mixed!.candidateIds).toEqual([fx.candidateA]);
    expect(await getDocumentAccess(ids.mixed)).not.toBeNull();
  });

  it("keeps workspace-level documents visible to a scoped caller", async () => {
    actAs("scoped");
    const hub = await getDocumentHubData();
    const workspaceDoc = hub.documents.find((doc) => doc.id === ids.workspace);
    expect(workspaceDoc?.associationLabels).toEqual(["Workspace"]);
  });

  it("keeps an explicit ACL grant authoritative over association scope", async () => {
    actAs("scoped");
    const hub = await getDocumentHubData();
    expect(hub.documents.map((doc) => doc.id)).toContain(ids.aclGrantedOnB);
    expect(await getDocumentAccess(ids.aclGrantedOnB)).not.toBeNull();
  });

  it("keeps a document the caller owns visible even when its association is out of scope", async () => {
    actAs("scoped");
    const hub = await getDocumentHubData();
    expect(hub.documents.map((doc) => doc.id)).toContain(ids.ownedByScopedOnB);
    expect(await getDocumentAccess(ids.ownedByScopedOnB)).not.toBeNull();
  });

  it("offers only in-scope candidates and jobs as association targets", async () => {
    actAs("scoped");
    const hub = await getDocumentHubData();
    const targetIds = hub.associationOptions.map((option) => option.id);
    expect(targetIds).toContain(fx.candidateA);
    expect(targetIds).not.toContain(fx.candidateB);
    expect(targetIds).toContain(fx.jobA);
    expect(targetIds).not.toContain(fx.jobB);
  });

  it("offers every candidate and job to an unrestricted caller", async () => {
    actAs("full");
    const hub = await getDocumentHubData();
    const targetIds = hub.associationOptions.map((option) => option.id);
    expect(targetIds).toEqual(expect.arrayContaining([fx.candidateA, fx.candidateB, fx.jobA, fx.jobB]));
    const visible = hub.documents.map((doc) => doc.id);
    expect(visible).toEqual(expect.arrayContaining([ids.candidateBOnly, ids.jobBOnly]));
    expect(await getDocumentAccess(ids.candidateBOnly)).not.toBeNull();
  });
});
