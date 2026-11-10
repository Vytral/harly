"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { FileDropzone } from "@/components/ui/FileDropzone";

import type { SectionProps } from "../types";
import { Field, TextField, ToggleRow } from "../primitives";
import { Group, PanelHeader } from "./PanelKit";

export function DiscoveryPanel({
  config,
  update,
  workspace,
  boardPath,
}: SectionProps & { boardPath: string }) {
  const t = useTranslations("features.careerPage.DiscoveryPanel");
  const title = config.seo.title || workspace.name || t("careers");
  const description =
    config.seo.description ||
    workspace.description ||
    workspace.tagline ||
    t("defaultDescription");
  const host = useSyncExternalStore(
    () => () => {},
    () => window.location.host,
    () => "",
  );
  const previewUrl = `${host}${boardPath}`;

  return (
    <div className="space-y-4">
      <PanelHeader title={t("title")} subtitle={t("subtitle")} />

      <Group title={t("searchEngines")} defaultOpen errorPrefix="seo.">
        <ToggleRow
          label={t("indexSite")}
          description={t("indexSiteDescription")}
          checked={config.seo.indexable}
          onCheckedChange={(value) => update((draft) => void (draft.seo.indexable = value))}
        />
        <TextField
          label={t("seoTitle")}
          path="seo.title"
          value={config.seo.title}
          max={70}
          placeholder={workspace.name || t("careers")}
          onChange={(v) => update((draft) => void (draft.seo.title = v))}
        />
        <TextField
          label={t("metaDescription")}
          path="seo.description"
          value={config.seo.description}
          max={180}
          rows={3}
          placeholder={workspace.description ?? t("metaDescriptionPlaceholder")}
          onChange={(v) => update((draft) => void (draft.seo.description = v))}
        />
        <div className="space-y-1.5">
          <span className="block text-[13px] font-medium text-near-ink">{t("searchPreview")}</span>
          <div className="space-y-1 rounded-[var(--radius-inner)] border border-hairline bg-pure-snow px-3.5 py-3">
            <p className="truncate text-[12px] text-soft-ink">{previewUrl}</p>
            <p className="line-clamp-2 text-[15px] font-medium leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
              {title}
            </p>
            <p className="line-clamp-3 text-[12px] leading-5 text-soft-ink">{description}</p>
          </div>
        </div>
      </Group>

      <Group title={t("shareAssets")} description={t("shareAssetsDescription")}>
        <Field label={t("favicon")} hint={t("faviconHint")}>
          <FileDropzone
            aspect="square"
            value={config.seo.faviconUrl}
            onChange={(url) => update((draft) => void (draft.seo.faviconUrl = url))}
          />
        </Field>
        <Field label={t("socialShareImage")} hint={t("socialShareImageHint")}>
          <FileDropzone
            aspect="banner"
            value={config.seo.socialImageUrl}
            onChange={(url) => update((draft) => void (draft.seo.socialImageUrl = url))}
          />
        </Field>
      </Group>
    </div>
  );
}
