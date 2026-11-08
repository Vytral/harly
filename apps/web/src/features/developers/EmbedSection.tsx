"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  buildApiSubmitSnippet,
  buildCspSnippet,
  buildCustomFormSnippet,
  buildFrameDocument,
  buildHtmlSnippet,
  buildIframeSnippet,
  buildReactSnippet,
  frameColors,
  isHexColor,
  type EmbedOptions,
  type EmbedTheme,
} from "@/features/developers/embed-snippets";
import { CodePanel } from "@/features/developers/developers-ui";
import { SectionHeader } from "@/features/workspaces/settings-ui";
import { ArrowsClockwiseIcon, CodeDuotoneIcon } from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Mode = "board" | "job";

const THEME_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

const MODE_OPTIONS = [
  { value: "board", label: "All open roles" },
  { value: "job", label: "One job" },
] as const;

function useDebounced<T>(value: T, delay = 450): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function EmbedSection({
  appUrl,
  publishableKey,
}: {
  appUrl: string;
  publishableKey?: { prefix: string; last4: string };
}) {
  const [mode, setMode] = useState<Mode>("board");
  const [jobSlug, setJobSlug] = useState("");
  const [department, setDepartment] = useState("");
  const [limit, setLimit] = useState("");
  const [theme, setTheme] = useState<EmbedTheme>("auto");
  const [accent, setAccent] = useState("");
  const [height, setHeight] = useState("640");
  const [pk, setPk] = useState("");
  const [previewNonce, setPreviewNonce] = useState(0);

  const options: EmbedOptions = useMemo(
    () => ({
      appUrl,
      publishableKey: pk,
      jobSlug: mode === "job" ? jobSlug : undefined,
      department: mode === "board" ? department : undefined,
      limit: mode === "board" && limit ? Number(limit) : undefined,
      theme,
      accent,
      height: Math.min(Math.max(Number(height) || 640, 240), 1600),
    }),
    [appUrl, pk, mode, jobSlug, department, limit, theme, accent, height],
  );

  const html = buildHtmlSnippet(options);
  const iframe = buildIframeSnippet(options);
  const react = buildReactSnippet(options);

  const previewOptions = useDebounced(options);
  const previewDoc = useMemo(
    () => buildFrameDocument(previewOptions, frameColors(previewOptions.theme)),
    [previewOptions],
  );
  const needsJob = mode === "job" && !jobSlug.trim();
  const accentInvalid = accent !== "" && !isHexColor(accent);
  const previewHeight = Math.min(options.height, 440);

  return (
    <Card className="gap-6 p-6">
      <SectionHeader
        icon={CodeDuotoneIcon}
        title="Embed widget"
        description="Show your open roles on any website. Pick what to show, check the live preview, then paste the code into your careers page. Candidates can browse roles and apply without leaving your site."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* ── Options ─────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          <Field label="What to show">
            <SegmentedControl
              aria-label="What to show"
              options={MODE_OPTIONS}
              value={mode}
              onValueChange={setMode}
            />
          </Field>

          {mode === "job" ? (
            <Field label="Job slug" htmlFor="embed-job" help="The last part of the job's public URL, e.g. senior-engineer.">
              <Input
                id="embed-job"
                value={jobSlug}
                onChange={(e) => setJobSlug(e.target.value.trim())}
                placeholder="senior-engineer"
                className="font-mono text-sm"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
              <Field label="Department (optional)" htmlFor="embed-dept" help="Preselects this filter. Match the name exactly.">
                <Input
                  id="embed-dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Engineering"
                />
              </Field>
              <Field label="Max roles" htmlFor="embed-limit" help="1 to 100.">
                <Input
                  id="embed-limit"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="All"
                  className="tabular-nums"
                />
              </Field>
            </div>
          )}

          <Field label="Theme" help="Auto inherits your site's text color. Light and dark pin the widget's palette.">
            <SegmentedControl
              aria-label="Theme"
              options={THEME_OPTIONS}
              value={theme}
              onValueChange={setTheme}
            />
          </Field>

          <Field
            label="Accent color"
            htmlFor="embed-accent-hex"
            help={accentInvalid ? undefined : "Buttons and focus rings. Empty uses your brand color."}
            error={accentInvalid ? "Use a 6-digit hex like #5b5bd6." : undefined}
          >
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick accent color"
                value={isHexColor(accent) ? accent : "#111827"}
                onChange={(e) => setAccent(e.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded-[var(--radius-btn)] border border-hairline bg-pure-snow p-1"
              />
              <Input
                id="embed-accent-hex"
                value={accent}
                onChange={(e) => setAccent(e.target.value.trim())}
                placeholder="Brand color"
                className="font-mono text-sm"
                aria-invalid={accentInvalid}
                spellCheck={false}
              />
              {accent ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setAccent("")}>
                  Reset
                </Button>
              ) : null}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Iframe height (px)" htmlFor="embed-height" help="Only used by the iframe snippet.">
              <Input
                id="embed-height"
                type="number"
                inputMode="numeric"
                min={240}
                max={1600}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="tabular-nums"
              />
            </Field>
            <Field
              label="Publishable key (optional)"
              htmlFor="embed-pk"
              help={
                publishableKey
                  ? `Paste your key (${publishableKey.prefix}…${publishableKey.last4}) to tie views to it.`
                  : "Create a publishable key above to track and revoke this embed."
              }
            >
              <Input
                id="embed-pk"
                value={pk}
                onChange={(e) => setPk(e.target.value.trim())}
                placeholder="harly_pk_live_…"
                className="font-mono text-sm"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
          </div>
        </div>

        {/* ── Live preview ────────────────────────────────────────── */}
        <div className="min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-near-ink">Live preview</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewNonce((n) => n + 1)}>
              <ArrowsClockwiseIcon className="size-3.5" /> Reload
            </Button>
          </div>
          <div
            className={cn(
              "overflow-hidden rounded-[var(--radius-inner)] border border-hairline",
              theme === "dark" ? "bg-[#18181b]" : "bg-white",
            )}
          >
            {needsJob ? (
              <div
                className="grid place-items-center px-6 text-center text-[13px] text-neutral-500"
                style={{ height: previewHeight }}
              >
                Enter a job slug to preview a single job.
              </div>
            ) : (
              <iframe
                key={previewNonce}
                title="Embed widget preview"
                srcDoc={previewDoc}
                // Same-origin lets the preview call the API even when the dashboard
                // runs on localhost/private networks; the content is only the
                // owner's own widget configuration (values are attribute-escaped).
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
                className="block w-full border-0"
                style={{ height: previewHeight }}
              />
            )}
          </div>
          <p className="text-[12px] text-soft-ink">
            This is the real widget loading your live jobs, so it matches what visitors see.
          </p>
        </div>
      </div>

      {/* ── Code ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-near-ink">Add it to your site</h3>
        <ol className="grid gap-2 text-[13px] text-near-ink sm:grid-cols-3">
          {[
            "Choose your options above.",
            "Copy the snippet for your stack.",
            "Paste it where the roles should appear, then publish.",
          ].map((text, i) => (
            <li key={text} className="flex items-start gap-2.5 rounded-[var(--radius-inner)] bg-card-inset px-3 py-2.5">
              <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-lime-wash text-[11px] font-semibold tabular-nums">
                {i + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>

        <Tabs defaultValue="html">
          <TabsList aria-label="Snippet type">
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="iframe">Iframe</TabsTrigger>
            <TabsTrigger value="react">React / Next.js</TabsTrigger>
          </TabsList>
          <TabsContent value="html" className="space-y-2">
            <p className="text-[12.5px] text-soft-ink">
              Works on any page. The widget renders inside the <code className="font-mono">div</code> and inherits your fonts.
            </p>
            <CodePanel code={html} language="HTML" />
          </TabsContent>
          <TabsContent value="iframe" className="space-y-2">
            <p className="text-[12.5px] text-soft-ink">
              Isolates the widget from your page&apos;s CSS and scripts. Good for site builders that only accept an iframe.
            </p>
            <CodePanel code={iframe} language="HTML" />
          </TabsContent>
          <TabsContent value="react" className="space-y-2">
            <p className="text-[12.5px] text-soft-ink">
              A client component for React, Next.js or any bundler. It loads the script on mount and cleans up on unmount.
            </p>
            <CodePanel code={react} language="TSX" />
          </TabsContent>
        </Tabs>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Callout tone="info" title="Who can embed it">
          The widget and the public jobs API are read-only and open to any website, so you can&apos;t restrict them to
          specific domains yet. A publishable key only identifies the embed; it grants no access to private data.
        </Callout>
        <div className="min-w-0 space-y-2">
          <p className="text-[13px] font-medium text-near-ink">Content Security Policy</p>
          <p className="text-[12.5px] text-soft-ink">
            If your site sets a CSP, allow Harly for scripts and API calls. Add your storage host to{" "}
            <code className="font-mono">connect-src</code> if candidates upload résumés.
          </p>
          <CodePanel code={buildCspSnippet(appUrl)} language="CSP" maxHeightClass="max-h-32" />
        </div>
      </div>

      <details className="group rounded-[var(--radius-inner)] border border-hairline">
        <summary className="cursor-pointer select-none list-none rounded-[var(--radius-inner)] px-4 py-3 text-[13px] font-medium text-near-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/10">
          Advanced: theme with CSS, or build your own apply form
        </summary>
        <div className="space-y-5 border-t border-hairline p-4">
          <div className="space-y-2">
            <p className="text-[12.5px] text-soft-ink">
              Override any token from your own stylesheet. Your CSS wins over the accent color above.
            </p>
            <CodePanel
              language="CSS"
              maxHeightClass="max-h-40"
              code={`.oh-root {\n  --oh-accent: #5b5bd6;\n  --oh-radius: 10px;\n  --oh-border: #2a2a2a;\n}`}
            />
          </div>
          <div className="space-y-2">
            <p className="text-[12.5px] text-soft-ink">
              Prefer your own markup? Load a job&apos;s questions and submit applications with the public API.
            </p>
            <CodePanel code={buildCustomFormSnippet(appUrl)} language="HTML" />
            <CodePanel code={buildApiSubmitSnippet(appUrl)} language="TypeScript" maxHeightClass="max-h-56" />
          </div>
        </div>
      </details>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  help,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      {htmlFor ? (
        <Label htmlFor={htmlFor}>{label}</Label>
      ) : (
        <p className="text-sm font-medium text-near-ink">{label}</p>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-[12px] font-medium text-danger-rust">
          {error}
        </p>
      ) : help ? (
        <p className="text-[12px] text-soft-ink">{help}</p>
      ) : null}
    </div>
  );
}
