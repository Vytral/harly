"use client";

import { Input } from "@/components/ui/input";
import type { CareerPageConfig, SocialPlatform } from "@/features/career-page/config";
import { socialPlatforms } from "@/features/career-page/config";
import { SocialIcon, socialLabel } from "@/features/career-page/social-icons";

import type { ConfigUpdater } from "../types";
import { Field, ListEditor, ToggleRow, move } from "../primitives";
import { Group, PanelHeader } from "./PanelKit";

const LEGAL_SLUG_LABELS: Record<string, string> = {
  "privacy-policy": "Privacy Policy",
  "terms-of-service": "Terms of Service",
  "cookie-policy": "Cookie Policy",
  "candidate-notice": "Candidate Notice",
  "ai-transparency-notice": "AI Transparency",
};

function SocialPlatformSelect({
  value,
  onChange,
}: {
  value: SocialPlatform;
  onChange: (v: SocialPlatform) => void;
}) {
  return (
    <div className="relative inline-flex shrink-0 items-center">
      <span className="pointer-events-none absolute left-2.5 text-near-ink">
        <SocialIcon platform={value} className="size-4" />
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SocialPlatform)}
        aria-label="Platform"
        className="h-9 w-32 appearance-none rounded-[var(--radius-btn)] border border-hairline bg-pure-snow pl-8 pr-2 text-[13px] text-near-ink transition-colors hover:border-mist-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {socialPlatforms.map((p) => (
          <option key={p} value={p}>
            {socialLabel(p)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FooterPanel({
  config,
  update,
  availableLegalPages = [],
}: {
  config: CareerPageConfig;
  update: ConfigUpdater;
  availableLegalPages?: string[];
}) {
  return (
    <div className="space-y-4">
      <PanelHeader title="Footer" subtitle="Social profiles and legal pages at the bottom of every page." />

      <Group title="Social links" defaultOpen errorPrefix="footer.socials">
        <ListEditor
          label="Profiles"
          itemName="Link"
          items={config.footer.socials}
          max={8}
          emptyText="Link your LinkedIn, X, GitHub or website."
          onAdd={() => update((d) => void d.footer.socials.push({ platform: "linkedin", url: "" }))}
          onRemove={(i) => update((d) => void d.footer.socials.splice(i, 1))}
          onRestore={(i, item) => update((d) => void d.footer.socials.splice(i, 0, item))}
          onMove={(i, dir) => update((d) => move(d.footer.socials, i, dir))}
          render={(item, i) => (
            <Field label={<span className="sr-only">Link {i + 1}</span>} path={`footer.socials.${i}.url`}>
              {({ id, describedBy, invalid }) => (
                <div className="flex gap-2">
                  <SocialPlatformSelect
                    value={item.platform}
                    onChange={(p) => update((d) => void (d.footer.socials[i].platform = p))}
                  />
                  <Input
                    id={id}
                    type="url"
                    value={item.url}
                    maxLength={600}
                    aria-describedby={describedBy}
                    aria-invalid={invalid || undefined}
                    onChange={(e) => update((d) => void (d.footer.socials[i].url = e.target.value))}
                    placeholder="https://…"
                    className="min-w-0 flex-1"
                  />
                </div>
              )}
            </Field>
          )}
        />
      </Group>

      <Group title="Legal pages" defaultOpen>
        {availableLegalPages.length === 0 ? (
          <p className="text-[12px] leading-snug text-soft-ink">
            No legal pages yet. Write them in Settings → Legal, then link them here.
          </p>
        ) : (
          availableLegalPages.map((slug) => {
            const checked = (config.footer.legalLinks ?? []).includes(slug);
            return (
              <ToggleRow
                key={slug}
                label={LEGAL_SLUG_LABELS[slug] ?? slug}
                checked={checked}
                onCheckedChange={(next) =>
                  update((d) => {
                    const links = (d.footer.legalLinks ?? []).filter((l) => l !== slug);
                    d.footer.legalLinks = next ? [...links, slug] : links;
                  })
                }
              />
            );
          })
        )}
      </Group>
    </div>
  );
}
