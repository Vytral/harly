"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

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

  const t = useTranslations("features.developers.embedSection");
  const modeOptions = [
    { value: "board", label: t("modeBoard") },
    { value: "job", label: t("modeJob") },
  ] as const;
  const themeOptions = [
    { value: "auto", label: t("themeAuto") },
    { value: "light", label: t("themeLight") },
    { value: "dark", label: t("themeDark") },
  ] as const;

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
        title={t("title")}
        description={t("description")}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* ── Options ─────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          <Field label={t("whatToShow")}>
            <SegmentedControl
              aria-label={t("whatToShow")}
              options={modeOptions}
              value={mode}
              onValueChange={setMode}
            />
          </Field>

          {mode === "job" ? (
            <Field label={t("jobSlug")} htmlFor="embed-job" help={t("jobSlugHelp")}>
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
              <Field label={t("department")} htmlFor="embed-dept" help={t("departmentHelp")}>
                <Input
                  id="embed-dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder={t("departmentPlaceholder")}
                />
              </Field>
              <Field label={t("maxRoles")} htmlFor="embed-limit" help={t("maxRolesHelp")}>
                <Input
                  id="embed-limit"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder={t("maxRolesPlaceholder")}
                  className="tabular-nums"
                />
              </Field>
            </div>
          )}

          <Field label={t("theme")} help={t("themeHelp")}>
            <SegmentedControl
              aria-label={t("theme")}
              options={themeOptions}
              value={theme}
              onValueChange={setTheme}
            />
          </Field>

          <Field
            label={t("accentColor")}
            htmlFor="embed-accent-hex"
            help={accentInvalid ? undefined : t("accentHelp")}
            error={accentInvalid ? t("accentError") : undefined}
          >
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={t("pickAccent")}
                value={isHexColor(accent) ? accent : "#111827"}
                onChange={(e) => setAccent(e.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded-[var(--radius-btn)] border border-hairline bg-pure-snow p-1"
              />
              <Input
                id="embed-accent-hex"
                value={accent}
                onChange={(e) => setAccent(e.target.value.trim())}
                placeholder={t("accentPlaceholder")}
                className="font-mono text-sm"
                aria-invalid={accentInvalid}
                spellCheck={false}
              />
              {accent ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setAccent("")}>
                  {t("reset")}
                </Button>
              ) : null}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("iframeHeight")} htmlFor="embed-height" help={t("iframeHeightHelp")}>
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
              label={t("publishableKey")}
              htmlFor="embed-pk"
              help={
                publishableKey
                  ? t("publishableKeyHelpExisting", {
                      preview: `${publishableKey.prefix}…${publishableKey.last4}`,
                    })
                  : t("publishableKeyHelpNone")
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
            <p className="text-sm font-medium text-near-ink">{t("livePreview")}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewNonce((n) => n + 1)}>
              <ArrowsClockwiseIcon className="size-3.5" /> {t("reload")}
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
                {t("enterJobSlug")}
              </div>
            ) : (
              <iframe
                key={previewNonce}
                title={t("previewTitle")}
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
            {t("liveWidgetNote")}
          </p>
        </div>
      </div>

      {/* ── Code ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-near-ink">{t("addToSite")}</h3>
        <ol className="grid gap-2 text-[13px] text-near-ink sm:grid-cols-3">
          {[t("steps.choose"), t("steps.copy"), t("steps.paste")].map((text, i) => (
            <li key={text} className="flex items-start gap-2.5 rounded-[var(--radius-inner)] bg-card-inset px-3 py-2.5">
              <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-lime-wash text-[11px] font-semibold tabular-nums">
                {i + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>

        <Tabs defaultValue="html">
          <TabsList aria-label={t("snippetType")}>
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="iframe">Iframe</TabsTrigger>
            <TabsTrigger value="react">React / Next.js</TabsTrigger>
          </TabsList>
          <TabsContent value="html" className="space-y-2">
            <p className="text-[12.5px] text-soft-ink">
              {t.rich("htmlHelp", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
            </p>
            <CodePanel code={html} language="HTML" />
          </TabsContent>
          <TabsContent value="iframe" className="space-y-2">
            <p className="text-[12.5px] text-soft-ink">
              {t("iframeHelp")}
            </p>
            <CodePanel code={iframe} language="HTML" />
          </TabsContent>
          <TabsContent value="react" className="space-y-2">
            <p className="text-[12.5px] text-soft-ink">
              {t("reactHelp")}
            </p>
            <CodePanel code={react} language="TSX" />
          </TabsContent>
        </Tabs>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Callout tone="info" title={t("whoCanEmbedTitle")}>
          {t("whoCanEmbedBody")}
        </Callout>
        <div className="min-w-0 space-y-2">
          <p className="text-[13px] font-medium text-near-ink">{t("cspTitle")}</p>
          <p className="text-[12.5px] text-soft-ink">
            {t.rich("cspHelp", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
          </p>
          <CodePanel code={buildCspSnippet(appUrl)} language="CSP" maxHeightClass="max-h-32" />
        </div>
      </div>

      <details className="group rounded-[var(--radius-inner)] border border-hairline">
        <summary className="cursor-pointer select-none list-none rounded-[var(--radius-inner)] px-4 py-3 text-[13px] font-medium text-near-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/10">
          {t("advanced")}
        </summary>
        <div className="space-y-5 border-t border-hairline p-4">
          <div className="space-y-2">
            <p className="text-[12.5px] text-soft-ink">
              {t("cssHelp")}
            </p>
            <CodePanel
              language="CSS"
              maxHeightClass="max-h-40"
              code={`.oh-root {\n  --oh-accent: #5b5bd6;\n  --oh-radius: 10px;\n  --oh-border: #2a2a2a;\n}`}
            />
          </div>
          <div className="space-y-2">
            <p className="text-[12.5px] text-soft-ink">
              {t("customFormHelp")}
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
