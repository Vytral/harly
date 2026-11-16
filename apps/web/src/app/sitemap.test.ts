import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  visibility: vi.fn(() => "PUBLIC_VISIBILITY"),
  jobWhere: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
}));
vi.mock("@harly/db", () => ({
  jobs: { slug: "slug", updatedAt: "updatedAt", workspaceId: "workspaceId" },
  organization: { id: "id", slug: "slug" },
  workspaceSettings: { updatedAt: "u", careerPageConfig: "c", organizationId: "o" },
  db: {
    select: (shape: Record<string, unknown>) => ({
      from: () => {
        if ("config" in shape) {
          return {
            leftJoin: async () => [
              { id: "ws1", slug: "acme", updatedAt: null, config: null },
            ],
          };
        }
        return {
          where: async (condition: unknown) => {
            m.jobWhere(condition);
            return [{ slug: "engineer", updatedAt: new Date("2026-01-01") }];
          },
        };
      },
    }),
  },
}));
vi.mock("@/features/career-page/config", () => ({
  normalizeCareerPageConfig: () => ({ seo: { indexable: true } }),
}));
vi.mock("@/features/jobs/data", () => ({
  publicJobVisibilityConditions: m.visibility,
}));
vi.mock("@/lib/public-origin", () => ({
  getHarlyPublicOrigin: () => "https://ats.example.test",
}));

import sitemap from "./sitemap";

describe("sitemap", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists jobs through the public visibility rules (no future or expired jobs)", async () => {
    const entries = await sitemap();
    expect(m.visibility).toHaveBeenCalled();
    expect(JSON.stringify(m.jobWhere.mock.calls[0]?.[0])).toContain("PUBLIC_VISIBILITY");
    expect(entries.map((e) => e.url)).toContain(
      "https://ats.example.test/board/acme/jobs/engineer",
    );
  });
});
