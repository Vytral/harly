"use client";

import { useCallback, useState, useTransition } from "react";

import { toast } from "@/lib/notification-island/toast";
import { cn } from "@/lib/utils";

import { FocusModeShell } from "@/components/focus-mode/FocusModeShell";
import { useUnsavedChangesGuard } from "@/components/focus-mode/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/focus-mode/UnsavedChangesDialog";
import { PreviewFrame } from "@/components/preview/PreviewFrame";
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
  const [config, setConfig] = useState<CareerPageConfig>(() =>
    initialConfig.template === "" ? CAREER_PRESETS.minimal() : initialConfig,
  );
  const [activeSection, setActiveSection] = useState<BuilderSection>("template");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, startSave] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const { confirmDiscard, discardDialogProps } = useUnsavedChangesGuard(dirty);

  const update = useCallback((producer: (draft: CareerPageConfig) => void) => {
    setConfig((prev) => {
      const next = structuredClone(prev);
      producer(next);
      return next;
    });
    setDirty(true);
    setJustSaved(false);
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
    setJustSaved(false);
  }

  async function handleExit() {
    if (!(await confirmDiscard())) return;
    window.location.href = "/dashboard";
  }

  function handleSave() {
    if (!dirty || saving) return;
    startSave(async () => {
      const result = await saveCareerPageConfigAction(config);
      if (result.success) {
        toast.success("Career page saved. It's live.");
        setDirty(false);
        setJustSaved(true);
        window.setTimeout(() => setJustSaved(false), 2000);
      } else {
        toast.error(result.error ?? "Could not save.");
      }
    });
  }

  const panelProps = { config, update, workspace };
  const hasTemplate = config.template !== "";

  return (
    <>
    <FocusModeShell
      topBar={
        <BuilderTopBar
          activeTemplate={(config.template || "minimal") as CareerTemplate}
          onTemplateChange={handleTemplateChange}
          onExit={handleExit}
          onSave={handleSave}
          saving={saving}
          dirty={dirty}
          justSaved={justSaved}
          boardUrl={`/board/${workspace.slug}`}
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
                boardRoot={`/board/${workspace.slug}`}
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
    <UnsavedChangesDialog
      open={discardDialogProps.open}
      onConfirm={discardDialogProps.onConfirm}
      onCancel={discardDialogProps.onCancel}
    />
    </>
  );
}
