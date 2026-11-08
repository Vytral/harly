/**
 * Builds the copy-paste snippets for the careers widget served from
 * `/embed/widget.js`. Attribute names mirror the widget's own contract
 * (data-pk, data-job, data-theme, data-accent, data-department, data-limit,
 * data-container); keep both in sync.
 */

export type EmbedTheme = "auto" | "light" | "dark";

export type EmbedOptions = {
  appUrl: string;
  /** Publishable key; omitted from the markup when empty. */
  publishableKey?: string;
  /** Render a single job instead of the board. */
  jobSlug?: string;
  department?: string;
  theme: EmbedTheme;
  /** `#rrggbb`; ignored when invalid so the workspace brand colour applies. */
  accent?: string;
  /** Max roles in the board (1-100). */
  limit?: number;
  /** Iframe height in px. */
  height: number;
};

export const CONTAINER_ID = "harly-jobs-container";

export function isHexColor(value: string | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function normalizeLimit(value: number | undefined): number | undefined {
  if (!value || !Number.isFinite(value) || value < 1) return undefined;
  return Math.min(Math.floor(value), 100);
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Ordered [name, value] attribute pairs, without the `data-` prefix. */
export function widgetAttributes(options: EmbedOptions): Array<[string, string]> {
  const attrs: Array<[string, string]> = [];
  const pk = options.publishableKey?.trim();
  if (pk) attrs.push(["pk", pk]);
  const job = options.jobSlug?.trim();
  if (job) {
    attrs.push(["job", job]);
  } else {
    const department = options.department?.trim();
    if (department) attrs.push(["department", department]);
    const limit = normalizeLimit(options.limit);
    if (limit) attrs.push(["limit", String(limit)]);
  }
  if (options.theme !== "auto") attrs.push(["theme", options.theme]);
  if (isHexColor(options.accent)) attrs.push(["accent", options.accent.toLowerCase()]);
  return attrs;
}

function scriptTag(options: EmbedOptions, indent = ""): string {
  const lines = [
    `${indent}<script`,
    `${indent}  src="${escapeAttr(options.appUrl)}/embed/widget.js"`,
    ...widgetAttributes(options).map(
      ([name, value]) => `${indent}  data-${name}="${escapeAttr(value)}"`,
    ),
    `${indent}  defer`,
    `${indent}></script>`,
  ];
  return lines.join("\n");
}

export function buildHtmlSnippet(options: EmbedOptions): string {
  return `<div id="${CONTAINER_ID}"></div>\n${scriptTag(options)}`;
}

/** The standalone document the iframe (and the live preview) renders. */
export function buildFrameDocument(
  options: EmbedOptions,
  frame: { background: string; color: string },
): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{margin:16px;font:14px/1.5 system-ui,sans-serif;background:${frame.background};color:${frame.color}}</style>
</head>
<body>
<div id="${CONTAINER_ID}"></div>
${scriptTag(options)}
</body>
</html>`;
}

export function frameColors(theme: EmbedTheme): { background: string; color: string } {
  return theme === "dark"
    ? { background: "#18181b", color: "#fafafa" }
    : { background: "#ffffff", color: "#18181b" };
}

function escapeSrcdoc(html: string): string {
  return html.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function buildIframeSnippet(options: EmbedOptions): string {
  const doc = buildFrameDocument(options, frameColors(options.theme));
  return `<iframe
  title="Careers"
  style="width:100%;height:${Math.round(options.height)}px;border:0"
  sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
  srcdoc="${escapeSrcdoc(doc)}"
></iframe>`;
}

export function buildReactSnippet(options: EmbedOptions): string {
  const attrs = widgetAttributes(options);
  const lines = [
    `    script.src = "${options.appUrl}/embed/widget.js";`,
    ...attrs.map(
      ([name, value]) => `    script.dataset.${name} = ${JSON.stringify(value)};`,
    ),
  ];
  return `"use client";

import { useEffect, useRef } from "react";

export function CareersWidget() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = container.current;
    const script = document.createElement("script");
${lines.join("\n")}
    document.body.appendChild(script);
    return () => {
      script.remove();
      if (node) node.innerHTML = "";
    };
  }, []);

  return <div id="${CONTAINER_ID}" ref={container} />;
}`;
}

export function buildCspSnippet(appUrl: string): string {
  return `script-src ${appUrl};\nconnect-src ${appUrl};`;
}

/** Build-your-own apply form against the public API (no widget). */
export function buildCustomFormSnippet(appUrl: string, slug = "your-job-slug"): string {
  return `<form id="harly-apply">
  <label>First name <input name="firstName" required /></label>
  <label>Last name <input name="lastName" required /></label>
  <label>Email <input name="email" type="email" required /></label>
  <div id="harly-questions"></div>
  <button type="submit">Apply</button>
</form>
<script>
  const jobApi = "${appUrl}/api/public/v1/jobs/${slug}";
  const form = document.getElementById("harly-apply");
  const questions = document.getElementById("harly-questions");

  fetch(jobApi)
    .then((r) => r.json())
    .then(({ data }) => {
      (data.applicationConfig?.questions || []).forEach((q) => {
        const label = document.createElement("label");
        label.textContent = q.label + (q.required ? " *" : "");
        let input = document.createElement(q.type === "textarea" ? "textarea" : "input");
        if (q.type === "select") {
          input = document.createElement("select");
          (q.options || []).forEach((option) => input.add(new Option(option, option)));
        }
        input.dataset.questionId = q.id;
        input.required = q.required;
        if (q.placeholder) input.placeholder = q.placeholder;
        label.appendChild(input);
        questions.appendChild(label);
      });
    });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    body.questionAnswers = Object.fromEntries(
      [...questions.querySelectorAll("[data-question-id]")].map((input) => [
        input.dataset.questionId,
        input.value,
      ])
    );
    const response = await fetch(jobApi + "/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Application failed");
    form.innerHTML = "<p>Application received. Thank you!</p>";
  });
</script>`;
}

export function buildApiSubmitSnippet(appUrl: string, slug = "your-job-slug"): string {
  return `async function submitApplication(values: {
  firstName: string;
  lastName: string;
  email: string;
}) {
  const res = await fetch(
    "${appUrl}/api/public/v1/jobs/${slug}/applications",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) throw new Error("Application failed");
  return res.json();
}`;
}
