import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, getPublicWorkspaceSlug, getCareerPageData } = vi.hoisted(
  () => ({
    redirect: vi.fn((href: string) => {
      throw new Error(`redirect:${href}`);
    }),
    getPublicWorkspaceSlug: vi.fn(),
    getCareerPageData: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/public-workspace", () => ({ getPublicWorkspaceSlug }));
vi.mock("@/features/career-page/data", () => ({ getCareerPageData }));
vi.mock("@/features/career-page/PublicCareerPage", () => ({
  PublicCareerPage: () => null,
}));

import HomePage from "./page";

describe("public home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the first workspace board at / with root-relative job links", async () => {
    getPublicWorkspaceSlug.mockResolvedValue("acme");
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

    const page = await HomePage();

    expect(redirect).not.toHaveBeenCalled();
    expect(getCareerPageData).toHaveBeenCalledWith("acme");
    expect(page.props.boardRoot).toBe("");
    expect(page.props.jobs).toEqual([
      expect.objectContaining({ slug: "software-engineer" }),
    ]);
  });
});
