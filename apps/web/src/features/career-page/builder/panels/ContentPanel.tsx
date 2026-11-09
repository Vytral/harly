"use client";

import { useTranslations } from "next-intl";

import { FileDropzone } from "@/components/ui/FileDropzone";
import { RichTextEditor } from "@/components/ui/RichTextEditor";

import type { SectionProps } from "../types";
import { capabilitiesFor, templateLabel } from "../template-capabilities";
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
  const t = useTranslations("features.careerPage.ContentPanel");
  const tTemplates = useTranslations("labels.careerPage.templates");
  const caps = capabilitiesFor(config.template);
  const hidden = [
    !caps.subhead && t("hiddenSubhead"),
    !caps.showHeadline && t("hiddenHeadline"),
    !caps.logoPosition && t("hiddenLogoPosition"),
    !caps.showName && t("hiddenCompanyName"),
    !caps.logoType && t("hiddenLogoStyle"),
    !caps.heroButton && t("hiddenHeroButton"),
    !caps.heroImage && !caps.banner && t("hiddenHeroImage"),
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <PanelHeader title={t("title")} subtitle={t("subtitle")} />

      <Group title={t("hero")} description={t("heroDescription")} defaultOpen errorPrefix="hero.">
        {caps.eyebrow ? (
          <TextField
            label={t("badgeAboveHeadline")}
            path="hero.eyebrow"
            value={config.hero.eyebrow ?? ""}
            max={60}
            placeholder={t("badgePlaceholder")}
            hint={t("badgeHint")}
            onChange={(v) => update((d) => void (d.hero.eyebrow = v))}
          />
        ) : null}
        <TextField
          label={t("headline")}
          path="hero.headline"
          value={config.hero.headline}
          max={120}
          placeholder={t("headlinePlaceholder", { name: workspace.name })}
          onChange={(v) => update((d) => void (d.hero.headline = v))}
        />
        {caps.showHeadline ? (
          <ToggleRow
            label={t("showHeadline")}
            description={t("showHeadlineDescription")}
            checked={config.hero.showHeadline}
            onCheckedChange={(v) => update((d) => void (d.hero.showHeadline = v))}
          />
        ) : null}
        {caps.subhead ? (
          <TextField
            label={t("subhead")}
            path="hero.subhead"
            value={config.hero.subhead}
            max={200}
            rows={2}
            placeholder={workspace.tagline || t("subheadPlaceholder")}
            onChange={(v) => update((d) => void (d.hero.subhead = v))}
          />
        ) : null}
        {caps.heroButton ? (
          <TextField
            label={t("buttonLabel")}
            path="hero.ctaButtonText"
            value={config.hero.ctaButtonText}
            max={60}
            placeholder={t("buttonPlaceholder")}
            hint={t("buttonHint")}
            onChange={(v) => update((d) => void (d.hero.ctaButtonText = v))}
          />
        ) : null}

        {caps.logoType ? (
          <Segmented
            label={t("logo")}
            value={config.hero.logoType}
            onChange={(v) => update((d) => void (d.hero.logoType = v))}
            options={[
              { value: "logo", label: t("logoSquareMark") },
              { value: "fullLogo", label: t("logoFullWordmark") },
            ]}
          />
        ) : null}
        {caps.logoPosition ? (
          <Segmented
            label={t("logoPosition")}
            value={config.hero.logoPosition}
            onChange={(v) => update((d) => void (d.hero.logoPosition = v))}
            options={[
              { value: "left", label: t("positionLeft"), icon: AlignLeftIcon },
              { value: "center", label: t("positionCenter"), icon: AlignCenterIcon },
              { value: "right", label: t("positionRight"), icon: AlignRightIcon },
            ]}
          />
        ) : null}
        {caps.showName ? (
          <ToggleRow
            label={t("showCompanyName")}
            checked={config.hero.showName}
            onCheckedChange={(v) => update((d) => void (d.hero.showName = v))}
          />
        ) : null}

        <HiddenNote template={templateLabel(config.template, tTemplates)} items={hidden} />
      </Group>

      {caps.banner ? (
        <Group
          title={t("banner")}
          description={t("bannerDescription")}
          enabled={config.hero.bannerEnabled}
          onEnabledChange={(v) => update((d) => void (d.hero.bannerEnabled = v))}
          defaultOpen={config.hero.bannerEnabled}
        >
          <Field label={t("bannerImage")}>
            <FileDropzone
              aspect="banner"
              value={config.hero.imageUrl}
              onChange={(url) => update((d) => void (d.hero.imageUrl = url))}
            />
          </Field>
          <Field label={t("darkenImage", { opacity: config.hero.overlayOpacity })}>
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
            label={t("logoOnBanner")}
            value={config.hero.bannerLogoVariant}
            onChange={(v) => update((d) => void (d.hero.bannerLogoVariant = v))}
            options={[
              { value: "dark", label: t("whiteLetters") },
              { value: "light", label: t("darkLetters") },
            ]}
          />
          {config.hero.bannerLogoVariant === "dark" ? (
            <Field label={t("wordmarkWhiteLetters")} hint={t("wordmarkWhiteLettersHint")}>
              <FileDropzone
                aspect="banner"
                value={config.hero.bannerLogoDark}
                onChange={(url) => update((d) => void (d.hero.bannerLogoDark = url))}
              />
            </Field>
          ) : (
            <Field label={t("wordmarkDarkLetters")} hint={t("wordmarkDarkLettersHint")}>
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
        <Group title={t("heroImage")} description={t("heroImageDescription")} errorPrefix="hero.overlay">
          <Field label={t("image")} hint={workspace.heroImageUrl ? t("imageHint") : undefined}>
            <FileDropzone
              aspect="banner"
              value={config.hero.imageUrl}
              onChange={(url) => update((d) => void (d.hero.imageUrl = url))}
            />
          </Field>
          {caps.heroGradient ? (
            <>
              <ToggleRow
                label={t("colourWash")}
                checked={config.hero.overlay === "gradient"}
                onCheckedChange={(v) => update((d) => void (d.hero.overlay = v ? "gradient" : "none"))}
              />
              {config.hero.overlay === "gradient" ? (
                <div className="grid grid-cols-2 gap-3">
                  <ColorField
                    label={t("from")}
                    value={config.hero.overlayFrom}
                    fallback={config.theme.accent ?? workspace.primaryColor}
                    onChange={(c) => update((d) => void (d.hero.overlayFrom = c))}
                  />
                  <ColorField
                    label={t("to")}
                    value={config.hero.overlayTo}
                    fallback="#ffffff"
                    hint={t("toHint")}
                    onChange={(c) => update((d) => void (d.hero.overlayTo = c))}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </Group>
      ) : null}

      <Group
        title={t("introduction")}
        description={t("introductionDescription")}
        defaultOpen
        errorPrefix="intro."
      >
        <Field label={t("aboutUs")} path="intro.body">
          <RichTextEditor
            key={`${config.template}-${contentKey}`}
            defaultValue={config.intro.body}
            placeholder={t("aboutUsPlaceholder")}
            minHeight="10rem"
            onChange={(html) => update((d) => void (d.intro.body = html))}
          />
        </Field>
        {caps.introChips ? (
          <ListEditor
            label={t("highlights")}
            itemName={t("highlight")}
            items={config.intro.chips}
            max={12}
            emptyText={t("highlightsEmpty")}
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
                    label={<span className="sr-only">{t("highlightNumber", { number: i + 1 })}</span>}
                    path={`intro.chips.${i}.label`}
                    value={chip.label}
                    max={40}
                    placeholder={t("labelPlaceholder")}
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
