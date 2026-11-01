import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@harly/db", () => ({ db: {}, member: {}, user: {} }));
vi.mock("../server/workspace-summary", () => ({ buildWorkspaceSummary: vi.fn() }));
vi.mock("@/features/workspaces/permissions", () => ({ roleLabel: vi.fn() }));

const search = vi.hoisted(() => ({
  resolveSearchActor: vi.fn(),
  searchWorkspaceForActor: vi.fn(),
}));
vi.mock("@/features/search/workspace-search", () => search);

import { runAsMcpActor, type McpActor } from "../actor";
import { workspaceTools } from "./workspace";

const tool = workspaceTools.find((candidate) => candidate.name === "workspace_search")!;

const group = (id: string) => ({ hasMore: false, hits: [{ id, primary: id, secondary: null, href: `/x/${id}` }] });

function actor(scopes: string[]): McpActor {
  return { scopes } as unknown as McpActor;
}

async function searchWith(scopes: string[]) {
  return runAsMcpActor(actor(scopes), async () =>
    (await tool.run({ query: "ada", limitPerGroup: 8 }, { appOrigin: "https://harly.test" } as never)) as {
      groups: Record<string, unknown[]>;
    },
  );
}

describe("workspace_search OAuth scopes", () => {
  beforeEach(() => {
    search.resolveSearchActor.mockResolvedValue({});
    search.searchWorkspaceForActor.mockResolvedValue({
      query: "ada",
      groups: {
        jobs: group("job-1"),
        candidates: group("candidate-1"),
        applications: group("application-1"),
        tasks: group("task-1"),
        people: group("user-1"),
      },
    });
  });

  it("returns only candidate groups to a token granted candidates:read alone", async () => {
    const result = await searchWith(["candidates:read"]);
    expect(Object.keys(result.groups).sort()).toEqual(["applications", "candidates"]);
  });

  it("returns every group a fully scoped token covers", async () => {
    const result = await searchWith(["candidates:read", "jobs:read", "tasks:read", "settings:read"]);
    expect(Object.keys(result.groups).sort()).toEqual(["applications", "candidates", "jobs", "people", "tasks"]);
  });
});
