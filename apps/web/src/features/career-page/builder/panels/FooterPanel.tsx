"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CareerPageConfig, SocialPlatform } from "@/features/career-page/config";
import { socialPlatforms } from "@/features/career-page/config";
import { SOCIAL_ICONS } from "@/features/career-page/social-icons";
import type { ConfigUpdater } from "../types";
import { ListEditor, move } from "../primitives";
import { PanelHeader, Section } from "./PanelKit";

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
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SocialPlatform)}
      className="shrink-0 rounded-lg border bg-background px-2 py-2 text-sm transition-colors hover:border-pine/20 focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine/20"
    >
      {socialPlatforms.map((p) => (
        <option key={p} value={p}>
          {SOCIAL_ICONS[p]?.label ?? p}
        </option>
      ))}
    </select>
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
    <div className="space-y-6">
      <PanelHeader title="Footer" subtitle="Social links and legal pages." />

      <Section title="Footer" defaultOpen>
        {availableLegalPages.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-soft">Legal links</Label>
            <p className="text-[11px] text-ink-soft">
              Select which legal pages appear in the footer.
            </p>
            {availableLegalPages.map((slug) => {
              const label = LEGAL_SLUG_LABELS[slug] ?? slug;
              const checked = (config.footer.legalLinks ?? []).includes(slug);
              return (
                <label key={slug} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      update((d) => {
                        const links = d.footer.legalLinks ?? [];
                        if (links.includes(slug)) {
                          d.footer.legalLinks = links.filter((l) => l !== slug);
                        } else {
                          d.footer.legalLinks = [...links, slug];
                        }
                      })
                    }
                    className="size-4 rounded accent-pine"
                  />
                  <span className="text-sm text-foreground">{label}</span>
                </label>
              );
            })}
          </div>
        )}
        <ListEditor
          label="Social links"
          items={config.footer.socials}
          onAdd={() =>
            update((d) => d.footer.socials.push({ platform: "x", url: "" }))
          }
          onRemove={(i) => update((d) => d.footer.socials.splice(i, 1))}
          onMove={(i, dir) => update((d) => move(d.footer.socials, i, dir))}
          render={(item, i) => (
            <div className="flex gap-2">
              <SocialPlatformSelect
                value={item.platform}
                onChange={(p) => update((d) => (d.footer.socials[i].platform = p))}
              />
              <Input
                value={item.url}
                onChange={(e) =>
                  update((d) => (d.footer.socials[i].url = e.target.value))
                }
                placeholder="https://…"
                className="min-w-0 flex-1"
              />
            </div>
          )}
        />
      </Section>
    </div>
  );
}
