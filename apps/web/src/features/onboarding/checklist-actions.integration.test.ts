import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db, setupChecklistStates } from "@harly/db";
import { and, eq } from "drizzle-orm";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

const ctx = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  /** Both racing skips read the checklist state before either writes it. */
  gate: { armed: false, arrived: 0, opened: null as Promise<void> | null, open: () => {} },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/demo/assert-not-demo", () => ({ assertNotDemo: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  requireWorkspaceRole: vi.fn(async () => ({
    organization: { id: ctx.workspaceId },
    user: { id: ctx.userId },
  })),
}));
vi.mock("./checklist-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./checklist-state")>();
  return {
    ...actual,
    readChecklistPreferences: vi.fn(async (input: Parameters<typeof actual.readChecklistPreferences>[0]) => {
      const value = await actual.readChecklistPreferences(input);
      if (ctx.gate.armed) {
        ctx.gate.arrived += 1;
        if (ctx.gate.arrived === 2) ctx.gate.open();
        await ctx.gate.opened;
      }
      return value;
    }),
  };
});

import { skipSetupChecklistItemAction } from "./checklist-actions";

async function storedSkips(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ skippedKeys: setupChecklistStates.skippedKeys })
    .from(setupChecklistStates)
    .where(
      and(
        eq(setupChecklistStates.workspaceId, workspaceId),
        eq(setupChecklistStates.userId, userId),
      ),
    );
  return [...(row?.skippedKeys ?? [])].sort();
}

describe.skipIf(!runPipelineIntegration)("setup checklist skip actions (database)", () => {
  let fixture: PipelineFixture;

  beforeEach(async () => {
    fixture = await createPipelineFixture();
    ctx.workspaceId = fixture.workspaceId;
    ctx.userId = fixture.userId;
    let open!: () => void;
    ctx.gate.opened = new Promise<void>((resolve) => {
      open = resolve;
    });
    ctx.gate.open = open;
    ctx.gate.arrived = 0;
    ctx.gate.armed = false;
  });

  afterEach(async () => {
    ctx.gate.armed = false;
    await fixture.cleanup();
  });

  it("keeps both skips when two members' steps are skipped at the same moment", async () => {
    ctx.gate.armed = true;

    const results = await Promise.all([
      skipSetupChecklistItemAction("invite_teammate"),
      skipSetupChecklistItemAction("connect_calendar"),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(await storedSkips(fixture.workspaceId, fixture.userId)).toEqual([
      "connect_calendar",
      "invite_teammate",
    ]);
  });

  it("repeating a skip changes nothing", async () => {
    await skipSetupChecklistItemAction("automate_workflow");
    await skipSetupChecklistItemAction("automate_workflow");

    expect(await storedSkips(fixture.workspaceId, fixture.userId)).toEqual(["automate_workflow"]);
  });

  it("rejects a required step without writing anything", async () => {
    const result = await skipSetupChecklistItemAction("create_job");

    expect(result.ok).toBe(false);
    expect(await storedSkips(fixture.workspaceId, fixture.userId)).toEqual([]);
  });
});
