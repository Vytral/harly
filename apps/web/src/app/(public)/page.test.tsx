import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const {
  redirect,
  getPublicWorkspaceSlug,
  getCareerPageData,
  isPortalEnabled,
  resolveSignedInRootRoute,
} = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  getPublicWorkspaceSlug: vi.fn(),
  getCareerPageData: vi.fn(),
  isPortalEnabled: vi.fn(),
  resolveSignedInRootRoute: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/features/onboarding/root-route", () => ({ resolveSignedInRootRoute }));
vi.mock("@/lib/public-workspace", () => ({ getPublicWorkspaceSlug }));
vi.mock("@/features/career-page/data", () => ({ getCareerPageData }));
vi.mock("@/lib/portal-auth", () => ({ isPortalEnabled }));
vi.mock("@/features/career-page/PublicCareerPage", () => ({
  PublicCareerPage: () => null,
}));
vi.mock("@/features/demo/DemoEntryButton", () => ({
  DemoEntryButton: () => null,
}));

import HomePage from "./page";

describe("public home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveSignedInRootRoute.mockResolvedValue(null);
  });

  it("sends a signed-in member to their app before loading the public board", async () => {
    resolveSignedInRootRoute.mockResolvedValue("/dashboard");

    await expect(
      HomePage(),
    ).rejects.toThrow("redirect:/dashboard");

    expect(redirect).toHaveBeenCalledWith("/dashboard");
    expect(getPublicWorkspaceSlug).not.toHaveBeenCalled();
    expect(getCareerPageData).not.toHaveBeenCalled();
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

    const page = (await HomePage()) as ReactElement<{ children: ReactElement<{ boardRoot: string; jobs: Array<{ slug: string }> }>[] }>;
    const board = page.props.children[0];

    expect(redirect).not.toHaveBeenCalled();
    expect(getCareerPageData).toHaveBeenCalledWith("acme");
    expect(board.props.boardRoot).toBe("");
    expect(board.props.jobs).toEqual([expect.objectContaining({ slug: "software-engineer" })]);
  });
});
