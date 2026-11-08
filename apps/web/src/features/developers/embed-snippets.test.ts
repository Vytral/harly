import { describe, expect, it } from "vitest";

import {
  buildCspSnippet,
  buildHtmlSnippet,
  buildIframeSnippet,
  buildReactSnippet,
  isHexColor,
  normalizeLimit,
  widgetAttributes,
  type EmbedOptions,
} from "./embed-snippets";

const base: EmbedOptions = {
  appUrl: "https://ats.example.com",
  theme: "auto",
  height: 640,
};

describe("widgetAttributes", () => {
  it("emits nothing for defaults", () => {
    expect(widgetAttributes(base)).toEqual([]);
  });

  it("emits only attributes the widget reads", () => {
    expect(
      widgetAttributes({
        ...base,
        publishableKey: " harly_pk_live_x ",
        department: "Engineering",
        limit: 500,
        theme: "dark",
        accent: "#5B5BD6",
      }),
    ).toEqual([
      ["pk", "harly_pk_live_x"],
      ["department", "Engineering"],
      ["limit", "100"],
      ["theme", "dark"],
      ["accent", "#5b5bd6"],
    ]);
  });

  it("single job mode drops board-only options", () => {
    expect(
      widgetAttributes({ ...base, jobSlug: "senior-dev", department: "Eng", limit: 3 }),
    ).toEqual([["job", "senior-dev"]]);
  });

  it("ignores invalid accents and limits", () => {
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#abc")).toBe(false);
    expect(normalizeLimit(0)).toBeUndefined();
    expect(normalizeLimit(2.9)).toBe(2);
    expect(widgetAttributes({ ...base, accent: "nope" })).toEqual([]);
  });
});

describe("snippets", () => {
  const opts: EmbedOptions = { ...base, theme: "light", department: 'R&D "Labs"' };

  it("html targets the widget route and the default container", () => {
    const html = buildHtmlSnippet(opts);
    expect(html).toContain('<div id="harly-jobs-container"></div>');
    expect(html).toContain('src="https://ats.example.com/embed/widget.js"');
    expect(html).toContain('data-theme="light"');
    expect(html).toContain('data-department="R&amp;D &quot;Labs&quot;"');
    expect(html).toMatch(/defer\n><\/script>/);
  });

  it("iframe embeds the same script inside an escaped srcdoc", () => {
    const iframe = buildIframeSnippet(opts);
    expect(iframe).toContain("height:640px");
    expect(iframe).toContain("srcdoc=");
    expect(iframe).toContain("src=&quot;https://ats.example.com/embed/widget.js&quot;");
    // the srcdoc attribute value must not contain a raw double quote
    const value = /srcdoc="([^]*?)"\n>/.exec(iframe)?.[1] ?? "";
    expect(value).not.toContain('"');
    expect(value).toContain("embed/widget.js");
  });

  it("react sets the same data attributes via dataset", () => {
    const react = buildReactSnippet({ ...opts, accent: "#112233" });
    expect(react).toContain('script.src = "https://ats.example.com/embed/widget.js"');
    expect(react).toContain('script.dataset.theme = "light"');
    expect(react).toContain('script.dataset.accent = "#112233"');
    expect(react).toContain('id="harly-jobs-container"');
  });

  it("csp lists the origin for scripts and API calls", () => {
    expect(buildCspSnippet("https://ats.example.com")).toBe(
      "script-src https://ats.example.com;\nconnect-src https://ats.example.com;",
    );
  });
});
