"use client";

import { useCallback, useState, useTransition, useRef, useLayoutEffect } from "react";

import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { FocusModeShell } from "@/components/focus-mode/FocusModeShell";
import { useUnsavedChangesGuard } from "@/components/focus-mode/useUnsavedChangesGuard";
import { saveCareerPageConfigAction } from "@/features/career-page/actions";
import { CAREER_PRESETS, type CareerPageConfig, type CareerTemplate } from "@/features/career-page/config";
import { CareerPageRender } from "@/features/career-page/CareerPageRender";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import type { Job } from "@/features/career-page/types";

import { BuilderTopBar } from "./BuilderTopBar";
import { BuilderSidebar, type BuilderSection } from "./BuilderSidebar";
import {
  TemplatePanel,
  ContentPanel,
  JobsPanel,
  DesignPanel,
  FooterPanel,
  DiscoveryPanel,
} from "./panels";
import { MonitorIcon, SmartphoneIcon } from "./builder-icons";

export function CareerPageBuilder({
  initialConfig,
  workspace,
  jobs,
  availableLegalPages = [],
}: {
  initialConfig: CareerPageConfig;
  workspace: WorkspaceBoardBranding & { id: string };
  jobs: Job[];
  availableLegalPages?: string[];
}) {
  const [config, setConfig] = useState<CareerPageConfig>(initialConfig);
  const [activeSection, setActiveSection] = useState<BuilderSection>("template");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, startSave] = useTransition();
  const [dirty, setDirty] = useState(false);
  const { confirmDiscard } = useUnsavedChangesGuard(dirty);

  const update = useCallback((producer: (draft: CareerPageConfig) => void) => {
    setConfig((prev) => {
      const next = structuredClone(prev);
      producer(next);
      return next;
    });
    setDirty(true);
  }, []);

  function handleTemplateChange(t: CareerTemplate) {
    if (config.template === "") {
      setConfig(CAREER_PRESETS[t]());
    } else {
      update((d) => {
        d.template = t;
      });
    }
    setDirty(true);
  }

  function handleExit() {
    if (!confirmDiscard()) return;
    window.location.href = "/dashboard";
  }

  function handleSave() {
    if (!dirty || saving) return;
    startSave(async () => {
      const result = await saveCareerPageConfigAction(config);
      if (result.success) {
        toast.success("Career page saved. It&apos;s live.");
        setDirty(false);
      } else {
        toast.error(result.error ?? "Could not save.");
      }
    });
  }

  const panelProps = { config, update, workspace };
  const hasTemplate = config.template !== "";

  return (
    <FocusModeShell
      topBar={
        <BuilderTopBar
          activeTemplate={(config.template || "minimal") as CareerTemplate}
          onTemplateChange={handleTemplateChange}
          onExit={handleExit}
          onSave={handleSave}
          saving={saving}
          dirty={dirty}
          boardUrl="/"
        />
      }
    >
      {/* Left nav rail */}
      <BuilderSidebar active={activeSection} onChange={setActiveSection} />

      {/* Editor column */}
      {hasTemplate ? (
        <div className="flex w-full max-w-[440px] shrink-0 flex-col overflow-y-auto border-r border-border bg-paper-raised">
          <div className="px-6 py-6">
            {activeSection === "template" && (
              <TemplatePanel config={config} update={update} setConfig={setConfig} />
            )}
            {activeSection === "content" && <ContentPanel {...panelProps} />}
            {activeSection === "jobs" && <JobsPanel config={config} update={update} />}
            {activeSection === "design" && <DesignPanel {...panelProps} />}
            {activeSection === "footer" && (
              <FooterPanel
                config={config}
                update={update}
                availableLegalPages={availableLegalPages}
              />
            )}
            {activeSection === "discovery" && <DiscoveryPanel {...panelProps} />}
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-[440px] shrink-0 items-center justify-center border-r border-border bg-paper-raised p-8">
          <p className="text-center text-sm text-ink-soft">
            Pick a template to start designing your career page.
          </p>
        </div>
      )}

      {/* Live preview */}
      <div className="hidden min-h-0 flex-1 flex-col bg-kraft/40 lg:flex">
        {/* Browser chrome / device switch */}
        <div className="flex items-center justify-between border-b border-border bg-paper-raised px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-rust/70" />
            <span className="size-2.5 rounded-full bg-clay/70" />
            <span className="size-2.5 rounded-full bg-success/70" />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {(["desktop", "mobile"] as const).map((d) => {
              const Icon = d === "desktop" ? MonitorIcon : SmartphoneIcon;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  className={cn(
                    "rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40",
                    device === d
                      ? "bg-sage text-pine"
                      : "text-ink-soft hover:text-foreground",
                  )}
                  aria-label={`${d} preview`}
                  aria-pressed={device === d}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
          <div className="w-14" />
        </div>

        {/* Preview frame */}
        <div className="flex-1 overflow-hidden p-6">
          {hasTemplate ? (
            <PreviewFrame device={device} background={config.theme.background}>
              <CareerPageRender
                config={config}
                workspace={workspace}
                jobs={jobs}
                boardRoot=""
              />
            </PreviewFrame>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ink-soft">
              Choose a template to see the live preview.
            </div>
          )}
        </div>
      </div>
    </FocusModeShell>
  );
}

/** Fixed design width per device , the preview renders at this width and is
 *  scaled down to fit the available column, so it's always WYSIWYG and never
 *  overflows (Tailwind breakpoints resolve against the design width, not the
 *  cramped column). */
const DESIGN_WIDTH = { desktop: 1280, mobile: 390 } as const;

function PreviewFrame({
  device,
  background,
  children,
}: {
  device: "desktop" | "mobile";
  background: string;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const designWidth = DESIGN_WIDTH[device];

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const measure = () => {
      setScale(Math.min(1, container.clientWidth / designWidth));
      setContentHeight(content.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(content);
    return () => ro.disconnect();
  }, [designWidth]);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto overflow-x-hidden">
      {/* Reserve the scaled footprint so the scroll area matches what's shown. */}
      <div
        className="mx-auto"
        style={{ width: designWidth * scale, height: contentHeight * scale }}
      >
        <div
          ref={contentRef}
          className="overflow-hidden rounded-xl border border-border bg-white shadow-lg"
          style={{
            width: designWidth,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
