import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const { redirect, getPublicWorkspaceSlug, getCareerPageData, isPortalEnabled } = vi.hoisted(
  () => ({
    redirect: vi.fn((href: string) => {
      throw new Error(`redirect:${href}`);
    }),
    getPublicWorkspaceSlug: vi.fn(),
    getCareerPageData: vi.fn(),
    isPortalEnabled: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/public-workspace", () => ({ getPublicWorkspaceSlug }));
vi.mock("@/features/career-page/data", () => ({ getCareerPageData }));
vi.mock("@/lib/portal-auth", () => ({ isPortalEnabled }));
vi.mock("@/features/career-page/PublicCareerPage", () => ({
  PublicCareerPage: () => null,
}));
vi.mock("@/features/demo/DemoStylePreview", () => ({
  DemoStylePreview: () => null,
}));

import HomePage from "./page";

describe("public home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the first workspace board at / with root-relative job links", async () => {
    getPublicWorkspaceSlug.mockResolvedValue("acme");
    isPortalEnabled.mockResolvedValue(false);
    getCareerPageData.mockResolvedValue({
      workspace: { id: "workspace-1", slug: "acme", name: "Acme" },
      jobs: [
        {
          id: "job-1",
          slug: "software-engineer",
          title: "Software Engineer",
          department: "Engineering",
          location: "Remote",
          employmentType: "full_time",
          workplaceType: "remote",
        },
      ],
      config: { template: "minimal" },
    });

    const page = (await HomePage({
      searchParams: Promise.resolve({}),
    })) as ReactElement<{ boardRoot: string; jobs: Array<{ slug: string }> }>;

    expect(redirect).not.toHaveBeenCalled();
    expect(getCareerPageData).toHaveBeenCalledWith("acme");
    expect(page.props.boardRoot).toBe("");
    expect(page.props.jobs).toEqual([expect.objectContaining({ slug: "software-engineer" })]);
  });

  it("renders the style picker landing instead in demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    getPublicWorkspaceSlug.mockResolvedValue("syntrix");
    isPortalEnabled.mockResolvedValue(false);
    getCareerPageData.mockResolvedValue({
      workspace: { id: "workspace-1", slug: "syntrix", name: "Syntrix" },
      jobs: [],
      config: { template: "playful" },
    });

    const page = (await HomePage({
      searchParams: Promise.resolve({ style: "join" }),
    })) as ReactElement<{ initialStyle: string; boardRoot?: string }>;

    expect(page.props.initialStyle).toBe("join");
    expect(page.props.boardRoot).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
