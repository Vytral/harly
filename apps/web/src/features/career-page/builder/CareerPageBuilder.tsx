"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { toast } from "@/lib/notification-island/toast";
import { cn } from "@/lib/utils";

import { FocusModeShell } from "@/components/focus-mode/FocusModeShell";
import { useUnsavedChangesGuard } from "@/components/focus-mode/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/focus-mode/UnsavedChangesDialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PreviewFrame, PREVIEW_DEVICE_WIDTH, type PreviewDevice } from "@/components/preview/PreviewFrame";
import { saveCareerPageConfigAction } from "@/features/career-page/actions";
import { CAREER_PRESETS, type CareerPageConfig, type CareerTemplate } from "@/features/career-page/config";
import { CareerPageRender } from "@/features/career-page/CareerPageRender";

import type { BuilderSection, BuilderWorkspace, Job } from "./types";
import { BuilderTopBar, type PublishState } from "./BuilderTopBar";
import { BuilderSidebar } from "./BuilderSidebar";
import { errorsBySection, sectionOfPath, validateConfig } from "./builder-logic";
import { FieldErrorsContext } from "./primitives";
import { templateLabel } from "./template-capabilities";
import {
  TemplatePanel,
  ContentPanel,
  SectionsPanel,
  JobsPanel,
  DesignPanel,
  FooterPanel,
  DiscoveryPanel,
} from "./panels";
import { MonitorIcon, SmartphoneIcon, TabletIcon } from "./builder-icons";

const DEVICES = [
  { value: "desktop", icon: MonitorIcon },
  { value: "tablet", icon: TabletIcon },
  { value: "mobile", icon: SmartphoneIcon },
] as const;

export function CareerPageBuilder({
  initialConfig,
  workspace,
  jobs,
  availableLegalPages = [],
}: {
  initialConfig: CareerPageConfig;
  workspace: BuilderWorkspace;
  jobs: Job[];
  availableLegalPages?: string[];
}) {
  const router = useRouter();
  const t = useTranslations("features.careerPage.careerPageBuilder");
  // A never-configured workspace starts from the Minimal preset, and that
  // preset can be published as-is (what you see is what goes live).
  const [neverPublished, setNeverPublished] = useState(initialConfig.template === "");
  const [config, setConfig] = useState<CareerPageConfig>(() =>
    initialConfig.template === "" ? CAREER_PRESETS.minimal() : initialConfig,
  );
  const [published, setPublished] = useState(() => JSON.stringify(initialConfig));
  const [activeSection, setActiveSection] = useState<BuilderSection>("template");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [publishing, startPublish] = useTransition();
  const [justPublished, setJustPublished] = useState(false);
  // Errors are shown from the first failed publish on, then live.
  const [showErrors, setShowErrors] = useState(false);
  // Bumped on reset so uncontrolled editors (rich text) reload their value.
  const [contentKey, setContentKey] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);

  const dirty = useMemo(
    () => neverPublished || JSON.stringify(config) !== published,
    [config, published, neverPublished],
  );
  const { confirmDiscard, discardDialogProps } = useUnsavedChangesGuard(dirty);

  const tLogic = useTranslations("labels.careerPage.builderLogic");
  const tTemplates = useTranslations("labels.careerPage.templates");
  const errors = useMemo(
    () => (showErrors ? validateConfig(config, tLogic) : {}),
    [showErrors, config, tLogic],
  );
  const errorCounts = useMemo(() => errorsBySection(errors), [errors]);

  const update = useCallback((producer: (draft: CareerPageConfig) => void) => {
    setConfig((prev) => {
      const next = structuredClone(prev);
      producer(next);
      return next;
    });
    setJustPublished(false);
  }, []);

  const replaceConfig = useCallback((next: CareerPageConfig) => {
    setConfig(next);
    setContentKey((k) => k + 1);
    setJustPublished(false);
  }, []);

  function handleTemplateChange(t: CareerTemplate) {
    if (t === config.template) return;
    // Content carries over; controls the new template ignores are hidden.
    update((d) => void (d.template = t));
  }

  async function handleExit() {
    if (!(await confirmDiscard())) return;
    router.push("/dashboard");
  }

  const handlePublish = useCallback(() => {
    if (!dirty || publishing) return;
    const issues = validateConfig(config, tLogic);
    const paths = Object.keys(issues);
    if (paths.length > 0) {
      setShowErrors(true);
      const first = paths[0];
      setActiveSection(sectionOfPath(first));
      toast.error(t("fixFields", { count: paths.length }));
      // Wait for the panel to render (and its card to open), then reveal the field.
      window.setTimeout(() => {
        const el = editorRef.current?.querySelector<HTMLElement>(`[data-field-path="${CSS.escape(first)}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.querySelector<HTMLElement>("input, textarea, [contenteditable=true]")?.focus({ preventScroll: true });
      }, 80);
      return;
    }
    const snapshot = config;
    startPublish(async () => {
      const result = await saveCareerPageConfigAction(snapshot);
      if (result.success) {
        setPublished(JSON.stringify(snapshot));
        setNeverPublished(false);
        setShowErrors(false);
        setJustPublished(true);
        toast.success(t("published"));
      } else {
        toast.error(result.error ?? t("publishFailed"));
      }
    });
  }, [config, dirty, publishing, t, tLogic]);

  // ⌘S / Ctrl+S publishes; always swallow the browser's "save page".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handlePublish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlePublish]);

  useEffect(() => {
    if (!justPublished) return;
    const t = window.setTimeout(() => setJustPublished(false), 4000);
    return () => window.clearTimeout(t);
  }, [justPublished]);

  const handlePreviewLink = useCallback(
    (href: string) => {
      const url = new URL(href);
      const isBoard = url.origin === window.location.origin && url.pathname.startsWith(`/board/${workspace.slug}`);
      toast(isBoard ? t("linkInactive") : t("externalLinkDisabled"), {
        description: isBoard ? t("jobPageNewTab") : url.host,
        action: {
          label: t("openInNewTab"),
          onClick: () => window.open(href, "_blank", "noopener,noreferrer"),
        },
      });
    },
    [workspace.slug, t],
  );

  const state: PublishState = publishing ? "publishing" : neverPublished ? "never" : dirty ? "dirty" : "live";
  const panelProps = { config, update, workspace };
  const boardPath = `/board/${workspace.slug}`;

  return (
    <>
      <FocusModeShell
        topBar={
          <BuilderTopBar
            state={state}
            justPublished={justPublished}
            templateLabel={templateLabel(config.template, tTemplates)}
            onExit={handleExit}
            onPublish={handlePublish}
            onTemplateClick={() => {
              setActiveSection("template");
              setMobileView("edit");
            }}
            boardUrl={boardPath}
          />
        }
      >
        <div className="flex min-h-0 w-full flex-1 flex-col md:flex-row">
          <BuilderSidebar
            active={activeSection}
            onChange={(s) => {
              setActiveSection(s);
              setMobileView("edit");
            }}
            errorCounts={errorCounts}
          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
          {/* Below lg the editor and preview share the screen through a toggle. */}
          <div className="flex items-center justify-center border-b border-hairline bg-warm-paper px-4 py-2 lg:hidden">
            <SegmentedControl
              aria-label={t("viewLabel")}
              value={mobileView}
              onValueChange={setMobileView}
              options={[
                { value: "edit", label: t("edit") },
                { value: "preview", label: t("preview") },
              ]}
              className="w-56"
            />
          </div>

          {/* Editor column */}
          <div
            ref={editorRef}
            className={cn(
              "min-h-0 w-full flex-1 overflow-y-auto border-hairline bg-warm-paper lg:block lg:w-[400px] lg:flex-none lg:border-r min-[87.5rem]:w-[420px]",
              mobileView === "edit" ? "block" : "hidden",
            )}
          >
            <FieldErrorsContext.Provider value={errors}>
              <div className="mx-auto max-w-xl px-5 py-6 lg:max-w-none">
                {activeSection === "template" && (
                  <TemplatePanel
                    config={config}
                    onTemplateChange={handleTemplateChange}
                    onReset={replaceConfig}
                  />
                )}
                {activeSection === "content" && <ContentPanel {...panelProps} contentKey={contentKey} />}
                {activeSection === "sections" && <SectionsPanel {...panelProps} />}
                {activeSection === "jobs" && <JobsPanel config={config} update={update} jobs={jobs} />}
                {activeSection === "design" && <DesignPanel {...panelProps} />}
                {activeSection === "footer" && (
                  <FooterPanel config={config} update={update} availableLegalPages={availableLegalPages} />
                )}
                {activeSection === "discovery" && <DiscoveryPanel {...panelProps} boardPath={boardPath} />}
              </div>
            </FieldErrorsContext.Provider>
          </div>

          {/* Live preview */}
          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 flex-col bg-card-inset lg:flex",
              mobileView === "preview" ? "flex" : "hidden",
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b border-hairline bg-pure-snow px-4 py-2">
              <p className="min-w-0 truncate text-[12px] text-soft-ink">
                <span className="font-medium text-near-ink">{t("preview")}</span>
                <span className="hidden xl:inline">
                  {" "}{t("previewMeta", { width: PREVIEW_DEVICE_WIDTH[device] })}
                </span>
              </p>
              <div role="radiogroup" aria-label={t("previewSize")} className="flex items-center gap-0.5 rounded-full bg-card-inset p-0.5">
                {DEVICES.map(({ value, icon: Icon }) => {
                  const label = t(`devices.${value}`);
                  return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={device === value}
                    aria-label={t("devicePreview", { device: label })}
                    title={t("deviceWidth", { device: label, width: PREVIEW_DEVICE_WIDTH[value] })}
                    onClick={() => setDevice(value)}
                    className={cn(
                      "rounded-full p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      device === value
                        ? "bg-pure-snow text-near-ink shadow-[var(--shadow-card)]"
                        : "text-soft-ink hover:text-near-ink",
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 p-4 xl:p-6">
              <PreviewFrame
                device={device}
                background={config.theme.background}
                onLinkClick={handlePreviewLink}
              >
                <CareerPageRender
                  config={config}
                  workspace={workspace}
                  jobs={jobs}
                  boardRoot={boardPath}
                />
              </PreviewFrame>
            </div>
          </div>
          </div>
        </div>
      </FocusModeShell>
      <UnsavedChangesDialog
        open={discardDialogProps.open}
        onConfirm={discardDialogProps.onConfirm}
        onCancel={discardDialogProps.onCancel}
      />
    </>
  );
}
