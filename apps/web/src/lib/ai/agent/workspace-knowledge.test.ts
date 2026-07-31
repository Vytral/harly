import { describe, expect, it } from "vitest";

import { buildWorkspaceKnowledge } from "./workspace-knowledge";

describe("workspace knowledge", () => {
  it("uses existing brand and careers settings as bounded factual context", () => {
    const result = buildWorkspaceKnowledge({
      workspaceName: "Syntrix",
      tagline: "Build useful things",
      description: "A product company.",
      websiteUrl: "https://syntrix.example",
      careerPageConfig: {
        hero: { headline: "Come build with us", subhead: "Ship with care" },
        intro: { body: "We work in small teams." },
        values: {
          enabled: true,
          items: [{ title: "Clarity", body: "Make the work understandable." }],
        },
        overview: {
          enabled: true,
          stats: [{ label: "Team", value: "12" }],
        },
      },
    });

    expect(result).toContain("Company: Syntrix");
    expect(result).toContain("Values:");
    expect(result).toContain("Clarity");
    expect(result).toContain("Website: https://syntrix.example");
    expect(result).toContain("Team: 12");
  });

  it("does not create fake company memory when nothing is configured", () => {
    expect(buildWorkspaceKnowledge({ workspaceName: "Syntrix" })).toBeNull();
  });
});
