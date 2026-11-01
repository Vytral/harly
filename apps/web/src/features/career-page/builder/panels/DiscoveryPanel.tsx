"use client";

import { useSyncExternalStore } from "react";

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
  const title = config.seo.title || workspace.name || "Careers";
  const description =
    config.seo.description ||
    workspace.description ||
    workspace.tagline ||
    "Explore open roles and build your next chapter with us.";
  const host = useSyncExternalStore(
    () => () => {},
    () => window.location.host,
    () => "",
  );
  const previewUrl = `${host}${boardPath}`;

  return (
    <div className="space-y-4">
      <PanelHeader title="SEO & sharing" subtitle="How your careers site shows up in search and link previews." />

      <Group title="Search engines" defaultOpen errorPrefix="seo.">
        <ToggleRow
          label="Let search engines index this site"
          description="When off, the careers page and every job use noindex and leave the sitemap."
          checked={config.seo.indexable}
          onCheckedChange={(value) => update((draft) => void (draft.seo.indexable = value))}
        />
        <TextField
          label="SEO title"
          path="seo.title"
          value={config.seo.title}
          max={70}
          placeholder={workspace.name || "Careers"}
          onChange={(v) => update((draft) => void (draft.seo.title = v))}
        />
        <TextField
          label="Meta description"
          path="seo.description"
          value={config.seo.description}
          max={180}
          rows={3}
          placeholder={workspace.description ?? "Tell candidates why they should join."}
          onChange={(v) => update((draft) => void (draft.seo.description = v))}
        />
        <div className="space-y-1.5">
          <span className="block text-[13px] font-medium text-near-ink">Search preview</span>
          <div className="space-y-1 rounded-[var(--radius-inner)] border border-hairline bg-pure-snow px-3.5 py-3">
            <p className="truncate text-[12px] text-soft-ink">{previewUrl}</p>
            <p className="line-clamp-2 text-[15px] font-medium leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
              {title}
            </p>
            <p className="line-clamp-3 text-[12px] leading-5 text-soft-ink">{description}</p>
          </div>
        </div>
      </Group>

      <Group title="Share assets" description="Favicon and link-preview image">
        <Field label="Favicon" hint="Square, at least 64×64.">
          <FileDropzone
            aspect="square"
            value={config.seo.faviconUrl}
            onChange={(url) => update((draft) => void (draft.seo.faviconUrl = url))}
          />
        </Field>
        <Field label="Social share image" hint="1200×630 works everywhere.">
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
