import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CAREER_PRESETS, type CareerPageConfig } from "@/features/career-page/config";
import { CareerPageRender } from "@/features/career-page/CareerPageRender";
import { CareerProcess } from "@/features/career-page/CareerProcess";
import type { Job } from "@/features/career-page/types";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

import { ShowcaseTemplate } from "./ShowcaseTemplate";

const workspace: WorkspaceBoardBranding & { id: string } = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  logoUrl: null,
  fullLogoUrl: null,
  tagline: "We make anvils.",
  description: null,
  websiteUrl: "https://acme.test",
  primaryColor: "#4f46e5",
  heroImageUrl: null,
  boardStyle: "default" as WorkspaceBoardBranding["boardStyle"],
  logoStyle: "default" as WorkspaceBoardBranding["logoStyle"],
  legalConfigured: false,
  consentCheckboxText: null,
  legalPages: null,
};

const jobs: Job[] = [
  { id: "1", slug: "eng", title: "Backend Engineer", department: "Engineering", location: "Berlin", employmentType: "full_time", workplaceType: "hybrid", salaryMin: 80000, salaryMax: 100000, currency: "EUR", salaryPeriod: "annual" },
  { id: "2", slug: "fe", title: "Frontend Engineer", department: "Engineering", location: null, employmentType: "full_time", workplaceType: "remote" },
  { id: "3", slug: "des", title: "Product Designer", department: "Design", location: "Lisbon", employmentType: "contract", workplaceType: "on_site" },
  { id: "4", slug: "ops", title: "Office Manager", department: null, location: "Berlin", employmentType: "part_time", workplaceType: "on_site" },
];

function render(config: CareerPageConfig, list: Job[] = jobs, portalEnabled = false) {
  return renderToStaticMarkup(
    createElement(ShowcaseTemplate, { config, workspace, jobs: list, boardRoot: "/board/acme", portalEnabled }),
  );
}

describe("ShowcaseTemplate", () => {
  it("is what CareerPageRender picks for template showcase", () => {
    const markup = renderToStaticMarkup(
      createElement(CareerPageRender, { config: CAREER_PRESETS.showcase(), workspace, jobs, boardRoot: "/board/acme" }),
    );
    expect(markup).toContain("Build what&#x27;s next with us");
    expect(markup).toContain('id="positions"');
  });

  it("renders the preset with landmarks, one h1, eyebrow count and grouped jobs", () => {
    const markup = render(CAREER_PRESETS.showcase());
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).toContain("<header");
    expect(markup).toContain("<main");
    expect(markup).toContain("<footer");
    expect(markup).toContain("We&#x27;re hiring");
    expect(markup).toContain("4 open roles");
    expect(markup).toContain('href="#positions"');
    // Grouped by department, "Other roles" last.
    expect(markup.indexOf(">Design<")).toBeLessThan(markup.indexOf(">Engineering<"));
    expect(markup.indexOf(">Engineering<")).toBeLessThan(markup.indexOf("Other roles"));
    expect(markup).toContain('href="/board/acme/jobs/eng"');
    // Salary when available.
    expect(markup).toMatch(/€80,000/);
    // All three filters enabled in the preset and each has 2+ values.
    expect(markup).toContain("All departments");
    expect(markup).toContain("All locations");
    expect(markup).toContain("All types");
    expect(markup).toContain('type="search"');
  });

  it("hides empty optional sections (no fake content in the preset)", () => {
    const markup = render(CAREER_PRESETS.showcase());
    expect(markup).not.toContain('id="culture"');
    expect(markup).not.toContain("How we hire");
    expect(markup).not.toContain("<dl");
    expect(markup).not.toContain("<blockquote");
  });

  it("uses a custom eyebrow and shows the empty state with a talent pool link", () => {
    const config = CAREER_PRESETS.showcase();
    config.hero.eyebrow = "Join the crew";
    const markup = render(config, [], true);
    expect(markup).toContain("Join the crew");
    expect(markup).not.toContain("open roles</span>");
    expect(markup).toContain("No open roles right now");
    expect(markup).toContain('href="/portal"');
  });

  it("renders filled sections: stats, benefits with icons from art, photos, voices, process, CTA", () => {
    const config = CAREER_PRESETS.showcase();
    config.overview.stats = [{ label: "Paying customers", value: "100k+" }];
    config.values.items = [
      { title: "Remote first", body: "Work from anywhere.", art: "globe" },
      { title: "Learning budget", body: "", art: "not-an-icon" },
    ];
    config.gallery = { enabled: true, images: ["/a.jpg", "/b.jpg", "javascript:alert(1)"], autoplay: true, speed: "slow" };
    config.testimonials.items = [{ quote: "Best team.", name: "Ada Lovelace", role: "Engineer", avatar: "" }];
    config.process = { enabled: true, title: "How we hire", steps: [{ title: "Intro call", body: "30 min" }, { title: "Onsite" }] };
    config.cta = { ...config.cta, enabled: true, url: "https://acme.test/talent" };
    const markup = render(config);

    expect(markup).toContain("100k+");
    expect(markup).toContain('id="culture"');
    expect(markup).toContain("Remote first");
    expect(markup).toContain("Life at Acme");
    expect(markup).toContain('src="/a.jpg"');
    expect(markup).not.toContain("javascript:");
    expect(markup).toContain("Best team.");
    expect(markup).toContain(">AL<");
    expect(markup).toContain("Intro call");
    expect(markup).toContain("Step 2: ");
    expect(markup).toContain('href="https://acme.test/talent"');
    expect(markup).toContain("Don&#x27;t see your role?");
  });

  it("shows the headline even when showHeadline is off", () => {
    const config = CAREER_PRESETS.showcase();
    config.hero.showHeadline = false;
    expect(render(config)).not.toMatch(/<h1[^>]*class="[^"]*sr-only/);
  });
});

describe("CareerProcess", () => {
  it("renders nothing when disabled or without titled steps", () => {
    const off = renderToStaticMarkup(
      createElement(CareerProcess, { process: { enabled: false, title: "x", steps: [{ title: "a" }] }, accent: "#000000" }),
    );
    const blank = renderToStaticMarkup(
      createElement(CareerProcess, { process: { enabled: true, title: "x", steps: [{ title: "  " }] }, accent: "#000000" }),
    );
    const missing = renderToStaticMarkup(createElement(CareerProcess, { process: undefined, accent: "#000000" }));
    expect(off + blank + missing).toBe("");
  });

  it("renders an ordered list with numbered steps", () => {
    const markup = renderToStaticMarkup(
      createElement(CareerProcess, {
        process: { enabled: true, title: "Hiring", steps: [{ title: "Apply" }, { title: "Chat", body: "Meet us" }] },
        accent: "#4f46e5",
        title: "Hiring",
      }),
    );
    expect(markup).toContain("<ol");
    expect(markup).toContain("<h2");
    expect(markup).toContain(">01<");
    expect(markup).toContain(">02<");
    expect(markup).toContain("Meet us");
  });
});
