import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./JobChrome", () => ({
  JobChrome: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./JobOverviewBody", () => ({ JobOverviewBody: () => <p>body</p> }));
vi.mock("@/i18n/server", () => ({ getTranslations: async () => (k: string) => k }));

import { PublicJobOverview } from "./PublicJobOverview";

function detail(indexable: boolean) {
  return {
    job: {
      title: "Engineer",
      slug: "engineer",
      description: "Build things",
      employmentType: "full_time",
      workplaceType: "remote",
      remoteEligibleCountries: [],
      publishedAt: new Date("2026-01-01"),
      createdAt: new Date("2026-01-01"),
      validThrough: null,
      salaryMin: null,
      salaryMax: null,
      location: null,
      jobLocationCountry: null,
      jobLocationRegion: null,
      currency: null,
      salaryPeriod: null,
    },
    workspace: { name: "Acme", websiteUrl: null, logoUrl: null, slug: "acme" },
    config: { seo: { indexable }, theme: {}, process: [] },
  };
}

describe("PublicJobOverview", () => {
  it("emits JobPosting JSON-LD for indexable career pages", () => {
    const html = renderToStaticMarkup(
      <PublicJobOverview detail={detail(true) as never} boardRoot="/" portalEnabled={false} />,
    );
    expect(html).toContain("application/ld+json");
    expect(html).toContain("JobPosting");
  });

  it("omits structured data when the career page is not indexable", () => {
    const html = renderToStaticMarkup(
      <PublicJobOverview detail={detail(false) as never} boardRoot="/" portalEnabled={false} />,
    );
    expect(html).not.toContain("application/ld+json");
  });
});
