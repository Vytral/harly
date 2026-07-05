"use client";

import { cn } from "@/lib/utils";
import { CAREER_PRESETS, type CareerPageConfig, type CareerTemplate } from "@/features/career-page/config";
import type { ConfigUpdater } from "../types";
import { PanelHeader } from "./PanelKit";

const TEMPLATE_META: Record<
  CareerTemplate,
  { label: string; blurb: string; ready: boolean; swatch: { bg: string; accent: string; ink: string } }
> = {
  minimal: {
    label: "Minimal",
    blurb: "Clean type, just the essentials",
    ready: true,
    swatch: { bg: "#ffffff", accent: "#1a1a1a", ink: "#e6e6e6" },
  },
  playful: {
    label: "Playful",
    blurb: "Colorful, friendly, high-energy",
    ready: true,
    swatch: { bg: "#FFF9E6", accent: "#f4c100", ink: "#f0e4b8" },
  },
  ashby: {
    label: "Ashby",
    blurb: "Structured, sidebar filters",
    ready: true,
    swatch: { bg: "#f7f7f5", accent: "#3f6212", ink: "#e2e2dd" },
  },
  folio: {
    label: "Folio",
    blurb: "Editorial, magazine-grade serif",
    ready: true,
    swatch: { bg: "#F7F4EE", accent: "#7A1E1E", ink: "#d8d2c4" },
  },
};

/** Tiny abstract wireframe of a template, drawn from its swatch palette. */
function TemplateThumb({ swatch }: { swatch: { bg: string; accent: string; ink: string } }) {
  return (
    <div
      className="flex h-16 w-20 shrink-0 flex-col gap-1.5 rounded-lg border border-border/70 p-2"
      style={{ background: swatch.bg }}
      aria-hidden
    >
      <div className="h-2 w-8 rounded-full" style={{ background: swatch.accent }} />
      <div className="h-1.5 w-full rounded-full" style={{ background: swatch.ink }} />
      <div className="h-1.5 w-10 rounded-full" style={{ background: swatch.ink }} />
      <div className="mt-auto flex gap-1">
        <div className="h-2 flex-1 rounded" style={{ background: swatch.ink }} />
        <div className="h-2 w-4 rounded" style={{ background: swatch.accent }} />
      </div>
    </div>
  );
}

export function TemplatePanel({
  config,
  update,
  setConfig,
}: {
  config: CareerPageConfig;
  update: ConfigUpdater;
  setConfig: (c: CareerPageConfig) => void;
}) {
  function chooseTemplate(t: CareerTemplate) {
    if (config.template === "") {
      setConfig(CAREER_PRESETS[t]());
    } else {
      update((d) => {
        d.template = t;
      });
    }
  }

  return (
    <div className="space-y-6">
      <PanelHeader title="Template" subtitle="Choose a base layout for your career page." />

      <div className="grid grid-cols-1 gap-3">
        {(["minimal", "playful", "ashby", "folio"] as const).map((t) => {
          const meta = TEMPLATE_META[t];
          const active = config.template === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => chooseTemplate(t)}
              disabled={!meta.ready}
              className={cn(
                "group relative flex items-center gap-4 rounded-xl border p-3.5 text-left transition-all duration-150",
                active
                  ? "border-pine/50 bg-sage/40 ring-1 ring-pine/20"
                  : meta.ready
                    ? "border-border hover:border-pine/30 hover:bg-kraft/50"
                    : "cursor-not-allowed opacity-40",
              )}
            >
              <TemplateThumb swatch={meta.swatch} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-cal text-base font-semibold text-foreground">{meta.label}</span>
                  {active && (
                    <span className="rounded-full bg-pine/10 px-2 py-0.5 text-[10px] font-medium text-pine">
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">{meta.blurb}</p>
                {!meta.ready && (
                  <span className="mt-1.5 inline-block rounded bg-clay/10 px-1.5 py-0.5 text-[10px] font-medium text-clay">
                    Coming soon
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {config.template !== "" && (
        <button
          type="button"
          onClick={() => {
            if (!confirm("Reset all settings to template defaults? This cannot be undone.")) return;
            setConfig(CAREER_PRESETS[config.template as CareerTemplate]());
          }}
          className="text-xs text-ink-soft underline-offset-2 hover:text-foreground hover:underline"
        >
          Reset to template defaults
        </button>
      )}
    </div>
  );
}
