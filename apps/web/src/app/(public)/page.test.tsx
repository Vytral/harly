import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

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
vi.mock("@/features/demo/DemoEntryButton", () => ({
  DemoEntryButton: () => null,
}));

import HomePage from "./page";

type CareerPageProps = {
  boardRoot: string;
  jobs: Array<{ slug: string }>;
};

function childElements(node: ReactNode): ReactElement[] {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(childElements);
  if (typeof node === "object" && "props" in node) {
    return [node as ReactElement];
  }
  return [];
}

function isCareerPageElement(
  child: ReactElement,
): child is ReactElement<CareerPageProps> {
  return (
    child.props != null &&
    typeof child.props === "object" &&
    "boardRoot" in child.props
  );
}

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

    const page = (await HomePage()) as ReactElement<{ children?: ReactNode }>;

    expect(redirect).not.toHaveBeenCalled();
    expect(getCareerPageData).toHaveBeenCalledWith("acme");

    // Home wraps PublicCareerPage + DemoEntryButton in a fragment; boardRoot
    // lives on the career page child, not the fragment itself.
    const careerPage = childElements(page.props.children).find(isCareerPageElement);

    expect(careerPage).toBeDefined();
    expect(careerPage!.props.boardRoot).toBe("");
    expect(careerPage!.props.jobs).toEqual([
      expect.objectContaining({ slug: "software-engineer" }),
    ]);
  });
});
