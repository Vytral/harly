"use client";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { careerTemplates, type CareerPageConfig, type CareerTemplate } from "@/features/career-page/config";

import { resetDesign, resetEverything } from "../builder-logic";
import { CheckIcon, ResetIcon } from "../builder-icons";
import { TEMPLATE_CAPABILITIES, type TemplateCapabilities } from "../template-capabilities";
import { Group, PanelHeader } from "./PanelKit";

/** Tiny abstract wireframe of a template, drawn from its swatch palette. */
function TemplateThumb({ swatch }: { swatch: TemplateCapabilities["swatch"] }) {
  return (
    <div
      className="flex h-16 w-20 shrink-0 flex-col gap-1.5 rounded-[10px] border border-hairline p-2"
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
  onTemplateChange,
  onReset,
}: {
  config: CareerPageConfig;
  onTemplateChange: (t: CareerTemplate) => void;
  /** Replaces the whole config (resets). */
  onReset: (next: CareerPageConfig) => void;
}) {
  const confirm = useConfirm();
  const active = (config.template || "minimal") as CareerTemplate;
  const activeLabel = TEMPLATE_CAPABILITIES[active].label;

  async function handleResetDesign() {
    const ok = await confirm({
      tone: "warning",
      title: `Reset the design to ${activeLabel} defaults?`,
      description:
        "Colours, font, hero layout and job filters go back to the template's defaults. Your text, photos, sections, SEO, socials and legal links stay as they are.",
      confirmLabel: "Reset design",
    });
    if (ok) onReset(resetDesign(config));
  }

  async function handleResetEverything() {
    const ok = await confirm({
      tone: "destructive",
      title: "Reset everything?",
      description: `Every setting goes back to a fresh ${activeLabel} page: your intro, sections, testimonials, FAQ, SEO, indexing, social and legal links are cleared. Nothing changes on the live page until you publish.`,
      confirmLabel: "Reset everything",
      requireAck: "I understand my content will be cleared",
    });
    if (ok) onReset(resetEverything(config));
  }

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Template"
        subtitle="The base layout. Switching keeps your content; controls a template doesn't use are hidden."
      />

      <div role="radiogroup" aria-label="Template" className="grid grid-cols-1 gap-2">
        {careerTemplates.map((t) => {
          const meta = TEMPLATE_CAPABILITIES[t];
          const isActive = active === t;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onTemplateChange(t)}
              className={cn(
                "flex items-center gap-4 rounded-[var(--radius-card)] border bg-pure-snow p-3 text-left transition-[border-color,box-shadow] duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "border-near-ink/70 shadow-[var(--shadow-card)]"
                  : "border-hairline hover:border-mist-border",
              )}
            >
              <TemplateThumb swatch={meta.swatch} />
              <div className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-near-ink">{meta.label}</span>
                <p className="mt-0.5 text-[12px] leading-snug text-soft-ink">{meta.blurb}</p>
              </div>
              <span
                aria-hidden
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border",
                  isActive ? "border-transparent bg-chartreuse-signal text-near-ink" : "border-hairline",
                )}
              >
                {isActive ? <CheckIcon className="size-3" strokeWidth={2.5} /> : null}
              </span>
            </button>
          );
        })}
      </div>

      <Group title="Start over" description="Reset to the template's defaults">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Button variant="outline" size="sm" onClick={handleResetDesign}>
              <ResetIcon />
              Reset design
            </Button>
            <p className="text-[12px] leading-snug text-soft-ink">
              Look and layout only. Keeps everything you wrote, uploaded and configured.
            </p>
          </div>
          <div className="space-y-1.5 border-t border-hairline pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetEverything}
              className="text-danger-rust hover:bg-danger-rust/10 hover:text-danger-rust"
            >
              Reset everything
            </Button>
            <p className="text-[12px] leading-snug text-soft-ink">
              Clears content, SEO and footer links too. Only goes live when you publish.
            </p>
          </div>
        </div>
      </Group>
    </div>
  );
}
