import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertNotDemo } from "@/features/demo/assert-not-demo";

const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const updates: Array<{ set: Record<string, unknown> }> = [];
  const updateFilters: unknown[] = [];
  const inserts: Array<{ values: Record<string, unknown> }> = [];
  return {
    selectQueue,
    updates,
    updateFilters,
    inserts,
    contextUser: { id: "user-1" } as { id: string },
    organization: { id: "org-1" },
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  or: (...args: unknown[]) => ({ __or: args }),
  ilike: (a: unknown, b: unknown) => ({ __ilike: [a, b] }),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    user: mocks.contextUser,
    organization: mocks.organization,
  })),
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn(async () => ({
    user: mocks.contextUser,
    organization: mocks.organization,
  })),
}));

vi.mock("@harly/db", () => {
  const makeQuery = () => {
    const q: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(mocks.selectQueue.shift() ?? []).then(resolve),
    };
    q.from = () => q;
    q.where = () => q;
    q.innerJoin = () => q;
    q.orderBy = () => q;
    q.limit = async () => mocks.selectQueue.shift() ?? [];
    return q;
  };

  return {
    db: {
      select: vi.fn(makeQuery),
      update: vi.fn(() => ({
        set: (set: Record<string, unknown>) => {
          mocks.updates.push({ set });
          return {
            where: async (filter: unknown) => {
              mocks.updateFilters.push(filter);
            },
          };
        },
      })),
      transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          select: vi.fn(makeQuery),
          insert: vi.fn(() => ({
            values: (values: Record<string, unknown>) => {
              mocks.inserts.push({ values });
              return Promise.resolve();
            },
          })),
          update: vi.fn(() => ({
            set: (set: Record<string, unknown>) => {
              mocks.updates.push({ set });
              return { where: async () => {} };
            },
          })),
        };
        return fn(tx);
      }),
    },
    schema: {
      user: {
        id: "user.id",
        username: "user.username",
        name: "user.name",
        jobTitle: "user.jobTitle",
        preferredEmailLocale: "user.preferredEmailLocale",
      },
      usernameHistory: {
        oldUsername: "usernameHistory.oldUsername",
        userId: "usernameHistory.userId",
      },
      member: { organizationId: "member.organizationId", role: "member.role" },
      jobHiringTeam: {
        workspaceId: "jobHiringTeam.workspaceId",
        userId: "jobHiringTeam.userId",
        jobId: "jobHiringTeam.jobId",
      },
      jobs: { id: "jobs.id", title: "jobs.title" },
    },
    RESERVED_USERNAMES: new Set([
      "account",
      "settings",
      "people",
      "admin",
      "api",
      "support",
    ]),
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 30,
    normalizeUsername: (input: string) =>
      input.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/demo/assert-not-demo", () => ({ assertNotDemo: vi.fn() }));

import {
  changeUsernameAction,
  checkUsernameAvailableAction,
  getProfileByUsernameAction,
  getOwnProfileAction,
  updateOwnEmailPreferenceAction,
  updateOwnProfileAction,
} from "./actions";

beforeEach(() => {
  vi.mocked(assertNotDemo).mockClear();
  mocks.selectQueue.length = 0;
  mocks.updates.length = 0;
  mocks.updateFilters.length = 0;
  mocks.inserts.length = 0;
  mocks.contextUser = { id: "user-1" };
});

describe("updateOwnEmailPreferenceAction", () => {
  it("stores a normalized preference for the signed-in user only", async () => {
    const result = await updateOwnEmailPreferenceAction({
      preferredEmailLocale: " PT-br ",
      userId: "attacker-selected-user",
    });

    expect(result.success).toBe(true);
    expect(mocks.updates).toEqual([{ set: { preferredEmailLocale: "pt-BR" } }]);
    expect(mocks.updateFilters).toEqual([
      { __eq: ["user.id", "user-1"] },
    ]);
    expect(assertNotDemo).toHaveBeenCalledOnce();
  });

  it("clears a preference when the user chooses no preference", async () => {
    await updateOwnEmailPreferenceAction({ preferredEmailLocale: null });
    expect(mocks.updates).toEqual([{ set: { preferredEmailLocale: null } }]);
  });

  it("rejects unsupported locales before updating the database", async () => {
    await expect(
      updateOwnEmailPreferenceAction({ preferredEmailLocale: "pt-PT" }),
    ).rejects.toThrow();
    expect(mocks.updates).toHaveLength(0);
  });

  it("keeps the demo guard ahead of any database update", async () => {
    vi.mocked(assertNotDemo).mockImplementationOnce(() => {
      throw new Error("disabled in demo");
    });

    await expect(
      updateOwnEmailPreferenceAction({ preferredEmailLocale: "fr" }),
    ).rejects.toThrow("disabled in demo");
    expect(mocks.updates).toHaveLength(0);
  });
});

describe("getOwnProfileAction", () => {
  it("returns the saved email preference from the current user's profile", async () => {
    mocks.selectQueue.push([{ id: "user-1", preferredEmailLocale: "fr" }]);
    await expect(getOwnProfileAction()).resolves.toMatchObject({
      preferredEmailLocale: "fr",
    });
  });
});

describe("updateOwnProfileAction", () => {
  it("always scopes the update to the current user, never a client-supplied id", async () => {
    const result = await updateOwnProfileAction({ name: "Ada Lovelace" });
    expect(result.success).toBe(true);
    expect(mocks.updates).toHaveLength(1);
    // No userId is accepted in the input at all — the WHERE clause always
    // binds to context.user.id from the session, not anything client-supplied.
  });
});

describe("checkUsernameAvailableAction", () => {
  it("reports available when username is free", async () => {
    mocks.selectQueue.push([]); // owner lookup: none
    mocks.selectQueue.push([]); // history lookup: none
    const result = await checkUsernameAvailableAction("ada-lovelace");
    expect(result.available).toBe(true);
  });

  it("reports taken when another user owns it", async () => {
    mocks.selectQueue.push([{ id: "someone-else" }]); // owner lookup
    const result = await checkUsernameAvailableAction("ada-lovelace");
    expect(result.available).toBe(false);
  });

  it("rejects invalid shape without querying", async () => {
    const result = await checkUsernameAvailableAction("a");
    expect(result.available).toBe(false);
  });
});

describe("changeUsernameAction", () => {
  it("records the old username in history and updates the user", async () => {
    mocks.selectQueue.push([{ username: "ada" }]); // current username lookup
    mocks.selectQueue.push([]); // isUsernameTaken: owner lookup none
    mocks.selectQueue.push([]); // isUsernameTaken: history lookup none
    const result = await changeUsernameAction("ada-lovelace");
    expect(result.success).toBe(true);
    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0].values).toMatchObject({
      oldUsername: "ada",
      userId: "user-1",
    });
    expect(mocks.updates).toHaveLength(1);
  });

  it("rejects when the new username is already taken", async () => {
    mocks.selectQueue.push([{ username: "ada" }]); // current username lookup
    mocks.selectQueue.push([{ id: "someone-else" }]); // owner lookup: taken
    const result = await changeUsernameAction("ada-lovelace");
    expect(result.success).toBe(false);
  });
});

describe("getProfileByUsernameAction", () => {
  it("returns found when the username matches a current user", async () => {
    mocks.selectQueue.push([{ id: "user-2", name: "Ada", username: "ada" }]);
    const result = await getProfileByUsernameAction("ada");
    expect(result.kind).toBe("found");
  });

  it("returns redirect when the username matches a historical alias", async () => {
    mocks.selectQueue.push([]); // no current user with this username
    mocks.selectQueue.push([{ userId: "user-2" }]); // history match
    mocks.selectQueue.push([{ username: "ada-lovelace" }]); // owner's current username
    const result = await getProfileByUsernameAction("ada");
    expect(result).toEqual({ kind: "redirect", username: "ada-lovelace" });
  });

  it("returns not_found when neither current nor historical username matches", async () => {
    mocks.selectQueue.push([]);
    mocks.selectQueue.push([]);
    const result = await getProfileByUsernameAction("nobody");
    expect(result.kind).toBe("not_found");
  });
});
