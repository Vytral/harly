"use client";

import { FileDropzone } from "@/components/ui/FileDropzone";
import { RichTextEditor } from "@/components/ui/RichTextEditor";

import type { SectionProps } from "../types";
import { capabilitiesFor } from "../template-capabilities";
import { Field, TextField, ToggleRow, ColorField, IconSelect, ListEditor, move } from "../primitives";
import { AlignLeftIcon, AlignCenterIcon, AlignRightIcon } from "../builder-icons";
import { Group, HiddenNote, PanelHeader, Segmented } from "./PanelKit";

export function ContentPanel({
  config,
  update,
  workspace,
  contentKey,
}: SectionProps & {
  /** Bumped on reset so the uncontrolled rich text editor reloads. */
  contentKey: number;
}) {
  const caps = capabilitiesFor(config.template);
  const hidden = [
    !caps.subhead && "subhead",
    !caps.showHeadline && "hide headline",
    !caps.logoPosition && "logo position",
    !caps.showName && "company name",
    !caps.logoType && "logo style",
    !caps.heroButton && "hero button",
    !caps.heroImage && !caps.banner && "hero image",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <PanelHeader title="Content" subtitle="The first thing candidates read: hero and introduction." />

      <Group title="Hero" description="Headline, logo and the top of the page" defaultOpen errorPrefix="hero.">
        {caps.eyebrow ? (
          <TextField
            label="Badge above the headline"
            path="hero.eyebrow"
            value={config.hero.eyebrow ?? ""}
            max={60}
            placeholder="We're hiring"
            hint="Leave empty to show the open-role count."
            onChange={(v) => update((d) => void (d.hero.eyebrow = v))}
          />
        ) : null}
        <TextField
          label="Headline"
          path="hero.headline"
          value={config.hero.headline}
          max={120}
          placeholder={`Careers at ${workspace.name}`}
          onChange={(v) => update((d) => void (d.hero.headline = v))}
        />
        {caps.showHeadline ? (
          <ToggleRow
            label="Show headline"
            description="Turn off when the logo already says it all."
            checked={config.hero.showHeadline}
            onCheckedChange={(v) => update((d) => void (d.hero.showHeadline = v))}
          />
        ) : null}
        {caps.subhead ? (
          <TextField
            label="Subhead"
            path="hero.subhead"
            value={config.hero.subhead}
            max={200}
            rows={2}
            placeholder={workspace.tagline || "A short tagline or mission statement"}
            onChange={(v) => update((d) => void (d.hero.subhead = v))}
          />
        ) : null}
        {caps.heroButton ? (
          <TextField
            label="Button label"
            path="hero.ctaButtonText"
            value={config.hero.ctaButtonText}
            max={60}
            placeholder="View jobs"
            hint="Scrolls to the open roles."
            onChange={(v) => update((d) => void (d.hero.ctaButtonText = v))}
          />
        ) : null}

        {caps.logoType ? (
          <Segmented
            label="Logo"
            value={config.hero.logoType}
            onChange={(v) => update((d) => void (d.hero.logoType = v))}
            options={[
              { value: "logo", label: "Square mark" },
              { value: "fullLogo", label: "Full wordmark" },
            ]}
          />
        ) : null}
        {caps.logoPosition ? (
          <Segmented
            label="Logo position"
            value={config.hero.logoPosition}
            onChange={(v) => update((d) => void (d.hero.logoPosition = v))}
            options={[
              { value: "left", label: "Left", icon: AlignLeftIcon },
              { value: "center", label: "Center", icon: AlignCenterIcon },
              { value: "right", label: "Right", icon: AlignRightIcon },
            ]}
          />
        ) : null}
        {caps.showName ? (
          <ToggleRow
            label="Show company name next to the logo"
            checked={config.hero.showName}
            onCheckedChange={(v) => update((d) => void (d.hero.showName = v))}
          />
        ) : null}

        <HiddenNote template={caps.label} items={hidden} />
      </Group>

      {caps.banner ? (
        <Group
          title="Banner"
          description="A full-width photo instead of the plain top bar"
          enabled={config.hero.bannerEnabled}
          onEnabledChange={(v) => update((d) => void (d.hero.bannerEnabled = v))}
          defaultOpen={config.hero.bannerEnabled}
        >
          <Field label="Banner image">
            <FileDropzone
              aspect="banner"
              value={config.hero.imageUrl}
              onChange={(url) => update((d) => void (d.hero.imageUrl = url))}
            />
          </Field>
          <Field label={`Darken image · ${config.hero.overlayOpacity}%`}>
            {({ id }) => (
              <input
                id={id}
                type="range"
                min={0}
                max={100}
                step={5}
                value={config.hero.overlayOpacity}
                onChange={(e) => update((d) => void (d.hero.overlayOpacity = Number(e.target.value)))}
                className="w-full accent-near-ink"
              />
            )}
          </Field>
          <Segmented
            label="Logo on the banner"
            value={config.hero.bannerLogoVariant}
            onChange={(v) => update((d) => void (d.hero.bannerLogoVariant = v))}
            options={[
              { value: "dark", label: "White letters" },
              { value: "light", label: "Dark letters" },
            ]}
          />
          {config.hero.bannerLogoVariant === "dark" ? (
            <Field label="Wordmark with white letters" hint="For dark banners. Falls back to your workspace logo.">
              <FileDropzone
                aspect="banner"
                value={config.hero.bannerLogoDark}
                onChange={(url) => update((d) => void (d.hero.bannerLogoDark = url))}
              />
            </Field>
          ) : (
            <Field label="Wordmark with dark letters" hint="For light banners. Falls back to your workspace logo.">
              <FileDropzone
                aspect="banner"
                value={config.hero.bannerLogoLight}
                onChange={(url) => update((d) => void (d.hero.bannerLogoLight = url))}
              />
            </Field>
          )}
        </Group>
      ) : null}

      {caps.heroImage ? (
        <Group title="Hero image" description="Photo band at the top of the page" errorPrefix="hero.overlay">
          <Field label="Image" hint={workspace.heroImageUrl ? "Empty uses your workspace hero image." : undefined}>
            <FileDropzone
              aspect="banner"
              value={config.hero.imageUrl}
              onChange={(url) => update((d) => void (d.hero.imageUrl = url))}
            />
          </Field>
          {caps.heroGradient ? (
            <>
              <ToggleRow
                label="Colour wash over the image"
                checked={config.hero.overlay === "gradient"}
                onCheckedChange={(v) => update((d) => void (d.hero.overlay = v ? "gradient" : "none"))}
              />
              {config.hero.overlay === "gradient" ? (
                <div className="grid grid-cols-2 gap-3">
                  <ColorField
                    label="From"
                    value={config.hero.overlayFrom}
                    fallback={config.theme.accent ?? workspace.primaryColor}
                    onChange={(c) => update((d) => void (d.hero.overlayFrom = c))}
                  />
                  <ColorField
                    label="To"
                    value={config.hero.overlayTo}
                    fallback="#ffffff"
                    hint="Empty fades out."
                    onChange={(c) => update((d) => void (d.hero.overlayTo = c))}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </Group>
      ) : null}

      <Group title="Introduction" description="About the company, culture and mission" defaultOpen errorPrefix="intro.">
        <Field label="About us" path="intro.body">
          <RichTextEditor
            key={`${config.template}-${contentKey}`}
            defaultValue={config.intro.body}
            placeholder="Tell candidates about your company, culture, mission…"
            minHeight="10rem"
            onChange={(html) => update((d) => void (d.intro.body = html))}
          />
        </Field>
        {caps.introChips ? (
          <ListEditor
            label="Highlights"
            itemName="Highlight"
            items={config.intro.chips}
            max={12}
            emptyText="Short words that describe you, e.g. Remote-first."
            onAdd={() => update((d) => void d.intro.chips.push({ label: "", icon: "" }))}
            onRemove={(i) => update((d) => void d.intro.chips.splice(i, 1))}
            onRestore={(i, item) => update((d) => void d.intro.chips.splice(i, 0, item))}
            onMove={(i, dir) => update((d) => move(d.intro.chips, i, dir))}
            render={(chip, i) => (
              <div className="flex items-start gap-2">
                <IconSelect
                  value={chip.icon ?? ""}
                  onChange={(v) => update((d) => void (d.intro.chips[i].icon = v))}
                />
                <div className="min-w-0 flex-1">
                  <TextField
                    label={<span className="sr-only">Highlight {i + 1}</span>}
                    path={`intro.chips.${i}.label`}
                    value={chip.label}
                    max={40}
                    placeholder="Label"
                    onChange={(v) => update((d) => void (d.intro.chips[i].label = v))}
                  />
                </div>
              </div>
            )}
          />
        ) : null}
      </Group>
    </div>
  );
}
