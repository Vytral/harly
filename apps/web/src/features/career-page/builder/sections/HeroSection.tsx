import { AlignCenter, AlignLeft, AlignRight, Layout } from "lucide-react";

import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/input";

import type { SectionProps } from "../types";
import { Section, Field, ToggleRow, ColorField } from "../primitives";

export function HeroSection({ config, update, workspace }: SectionProps) {
  return (
    <Section title="Hero" icon={Layout} defaultOpen>
      <Field label="Headline">
        <Input
          value={config.hero.headline}
          onChange={(e) => update((d) => (d.hero.headline = e.target.value))}
          placeholder="Join us"
        />
      </Field>
      <Field label="Subhead">
        <Input
          value={config.hero.subhead}
          onChange={(e) => update((d) => (d.hero.subhead = e.target.value))}
          placeholder="A short tagline or mission statement"
        />
      </Field>
      <Field label="Banner image">
        <FileDropzone
          aspect="banner"
          value={config.hero.imageUrl}
          onChange={(url) => update((d) => (d.hero.imageUrl = url))}
        />
      </Field>
      <ToggleRow
        label="Gradient overlay (left → right)"
        checked={config.hero.overlay === "gradient"}
        onCheckedChange={(v) =>
          update((d) => (d.hero.overlay = v ? "gradient" : "none"))
        }
      />
      {config.hero.overlay === "gradient" && (
        <div className="grid grid-cols-2 gap-2">
          <ColorField
            label="From"
            value={config.hero.overlayFrom}
            fallback={config.theme.accent ?? workspace.primaryColor}
            onChange={(c) => update((d) => (d.hero.overlayFrom = c))}
          />
          <ColorField
            label="To"
            value={config.hero.overlayTo}
            fallback="#ffffff"
            onChange={(c) => update((d) => (d.hero.overlayTo = c))}
          />
        </div>
      )}
      <Field label="Logo position">
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {(["left", "center", "right"] as const).map((pos) => {
            const Icon = pos === "left" ? AlignLeft : pos === "center" ? AlignCenter : AlignRight;
            return (
              <button
                key={pos}
                type="button"
                onClick={() => update((d) => { d.hero.logoPosition = pos; })}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  config.hero.logoPosition === pos
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5" strokeWidth={1.8} />
                {pos.charAt(0).toUpperCase() + pos.slice(1)}
              </button>
            );
          })}
        </div>
      </Field>
      <ToggleRow
        label="Show company name next to logo"
        checked={config.hero.showName}
        onCheckedChange={(v) => update((d) => { d.hero.showName = v; })}
      />
    </Section>
  );
}
