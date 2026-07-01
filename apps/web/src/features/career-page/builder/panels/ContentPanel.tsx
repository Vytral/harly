"use client";

import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";

import type { CareerPageConfig } from "@/features/career-page/config";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import type { ConfigUpdater } from "../types";
import { Field, ToggleRow, ColorField, IconSelect, ListEditor, move } from "../primitives";
import { AlignLeftIcon, AlignCenterIcon, AlignRightIcon } from "../builder-icons";
import { PanelHeader, Section, Segmented } from "./PanelKit";

type ContentPanelProps = {
  config: CareerPageConfig;
  update: ConfigUpdater;
  workspace: WorkspaceBoardBranding & { id: string };
};

export function ContentPanel({ config, update, workspace }: ContentPanelProps) {
  return (
    <div className="space-y-6">
      <PanelHeader title="Content" subtitle="Headlines, images, and intro content." />

      <Section title="Hero" defaultOpen>
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
        <ToggleRow
          label="Show headline"
          checked={config.hero.showHeadline}
          onCheckedChange={(v) => update((d) => (d.hero.showHeadline = v))}
        />

        {/* Minimal-specific hero options */}
        {config.template === "minimal" && (
          <>
            <ToggleRow
              label="Use banner image instead of topbar"
              checked={config.hero.bannerEnabled}
              onCheckedChange={(v) => update((d) => (d.hero.bannerEnabled = v))}
            />
            {config.hero.bannerEnabled && (
              <>
                <Field label="Banner image">
                  <FileDropzone
                    aspect="banner"
                    value={config.hero.imageUrl}
                    onChange={(url) => update((d) => (d.hero.imageUrl = url))}
                  />
                </Field>
                <Field label={`Overlay opacity — ${config.hero.overlayOpacity}%`}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={config.hero.overlayOpacity}
                    onChange={(e) =>
                      update((d) => (d.hero.overlayOpacity = Number(e.target.value)))
                    }
                    className="w-full accent-pine"
                  />
                </Field>
                <Field label="Banner logo variant">
                  <Segmented
                    value={config.hero.bannerLogoVariant}
                    onChange={(v) => update((d) => (d.hero.bannerLogoVariant = v))}
                    options={[
                      { value: "dark", label: "White letters" },
                      { value: "light", label: "Dark letters" },
                    ]}
                  />
                </Field>
                <Field label="Full logo — white letters (for dark banners)">
                  <FileDropzone
                    aspect="banner"
                    value={config.hero.bannerLogoDark}
                    onChange={(url) => update((d) => (d.hero.bannerLogoDark = url))}
                  />
                </Field>
                <Field label="Full logo — dark letters (for light banners)">
                  <FileDropzone
                    aspect="banner"
                    value={config.hero.bannerLogoLight}
                    onChange={(url) => update((d) => (d.hero.bannerLogoLight = url))}
                  />
                </Field>
              </>
            )}
            <Field label="Logo to display">
              <Segmented
                value={config.hero.logoType}
                onChange={(v) => update((d) => (d.hero.logoType = v))}
                options={[
                  { value: "logo", label: "Square mark" },
                  { value: "fullLogo", label: "Full wordmark" },
                ]}
              />
            </Field>
            <Field label="Button text">
              <Input
                value={config.hero.ctaButtonText}
                onChange={(e) => update((d) => (d.hero.ctaButtonText = e.target.value))}
                placeholder="View jobs"
              />
            </Field>
          </>
        )}

        {/* Banner image + overlay — Playful & Ashby */}
        {config.template !== "minimal" && (
          <>
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
          </>
        )}

        <Field label="Logo position">
          <Segmented
            value={config.hero.logoPosition}
            onChange={(v) => update((d) => (d.hero.logoPosition = v))}
            options={[
              { value: "left", label: "Left", icon: <AlignLeftIcon className="size-3.5" strokeWidth={1.8} /> },
              { value: "center", label: "Center", icon: <AlignCenterIcon className="size-3.5" strokeWidth={1.8} /> },
              { value: "right", label: "Right", icon: <AlignRightIcon className="size-3.5" strokeWidth={1.8} /> },
            ]}
          />
        </Field>
        <ToggleRow
          label="Show company name next to logo"
          checked={config.hero.showName}
          onCheckedChange={(v) => update((d) => { d.hero.showName = v; })}
        />
      </Section>

      <Section title="Intro & content">
        <Field label="Intro / about us">
          <RichTextEditor
            key={config.template}
            defaultValue={config.intro.body}
            placeholder="Tell candidates about your company, culture, mission…"
            minHeight="10rem"
            onChange={(html) => update((d) => (d.intro.body = html))}
          />
        </Field>
        {config.template === "playful" && (
          <ListEditor
            label="Chips"
            items={config.intro.chips}
            onAdd={() =>
              update((d) => d.intro.chips.push({ label: "New", icon: "" }))
            }
            onRemove={(i) => update((d) => d.intro.chips.splice(i, 1))}
            onMove={(i, dir) => update((d) => move(d.intro.chips, i, dir))}
            render={(chip, i) => (
              <div className="flex gap-2">
                <Input
                  value={chip.label}
                  onChange={(e) =>
                    update((d) => (d.intro.chips[i].label = e.target.value))
                  }
                  placeholder="Label"
                  className="min-w-0"
                />
                <IconSelect
                  value={chip.icon ?? ""}
                  onChange={(v) => update((d) => (d.intro.chips[i].icon = v))}
                />
              </div>
            )}
          />
        )}
      </Section>
    </div>
  );
}
