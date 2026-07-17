"use client";

import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/input";
import type { CareerPageConfig } from "@/features/career-page/config";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

import type { ConfigUpdater } from "../types";
import { Field, ToggleRow } from "../primitives";
import { PanelHeader, Section } from "./PanelKit";

export function DiscoveryPanel({
  config,
  update,
  workspace,
}: {
  config: CareerPageConfig;
  update: ConfigUpdater;
  workspace: WorkspaceBoardBranding;
}) {
  const title = config.seo.title || `${workspace.name} careers`;
  const description = config.seo.description || workspace.description || workspace.tagline || "Explore open roles and build your next chapter with us.";

  return (
    <div className="space-y-6">
      <PanelHeader title="Discovery" subtitle="Control how your careers site appears in search and shares." />

      <Section title="Search engines" defaultOpen>
        <ToggleRow
          label="Allow search engines to index this careers site"
          checked={config.seo.indexable}
          onCheckedChange={(value) => update((draft) => (draft.seo.indexable = value))}
        />
        <p className="text-xs leading-5 text-ink-soft">
          When off, the careers page and every job use noindex and are removed from Harly&apos;s sitemap.
        </p>
        <Field label="SEO title">
          <Input value={config.seo.title} maxLength={70} onChange={(event) => update((draft) => (draft.seo.title = event.target.value))} placeholder={`${workspace.name} careers`} />
        </Field>
        <Field label="Meta description">
          <textarea
            value={config.seo.description}
            maxLength={180}
            rows={4}
            onChange={(event) => update((draft) => (draft.seo.description = event.target.value))}
            placeholder={workspace.description ?? "Tell candidates why they should join."}
            className="flex w-full resize-y rounded-lg border border-border bg-paper px-3 py-2 text-sm text-foreground outline-none placeholder:text-ink-soft focus-visible:ring-2 focus-visible:ring-pine/40"
          />
        </Field>
      </Section>

      <Section title="Share assets">
        <Field label="Favicon">
          <FileDropzone aspect="square" value={config.seo.faviconUrl} onChange={(url) => update((draft) => (draft.seo.faviconUrl = url))} />
        </Field>
        <Field label="Social share image">
          <FileDropzone aspect="banner" value={config.seo.socialImageUrl} onChange={(url) => update((draft) => (draft.seo.socialImageUrl = url))} />
        </Field>
      </Section>

      <Section title="Search preview">
        <div className="space-y-1.5 rounded-lg border border-border bg-paper px-3 py-3">
          <p className="truncate text-xs text-success">careers.your-domain.com / board / {workspace.slug}</p>
          <p className="line-clamp-2 text-sm font-medium text-pine">{title}</p>
          <p className="line-clamp-3 text-xs leading-5 text-ink-soft">{description}</p>
        </div>
      </Section>
    </div>
  );
}
