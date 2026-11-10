"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import type { CareerPageConfig, SocialPlatform } from "@/features/career-page/config";
import { socialPlatforms } from "@/features/career-page/config";
import { SocialIcon, socialLabel } from "@/features/career-page/social-icons";

import type { ConfigUpdater } from "../types";
import { Field, ListEditor, ToggleRow, move } from "../primitives";
import { Group, PanelHeader } from "./PanelKit";

const LEGAL_SLUG_KEYS: Record<string, "privacyPolicy" | "termsOfService" | "cookiePolicy" | "candidateNotice" | "aiTransparency"> = {
  "privacy-policy": "privacyPolicy",
  "terms-of-service": "termsOfService",
  "cookie-policy": "cookiePolicy",
  "candidate-notice": "candidateNotice",
  "ai-transparency-notice": "aiTransparency",
};

function SocialPlatformSelect({
  value,
  onChange,
}: {
  value: SocialPlatform;
  onChange: (v: SocialPlatform) => void;
}) {
  const t = useTranslations("features.careerPage.FooterPanel");
  const tSocial = useTranslations("labels.careerPage.social");
  return (
    <div className="relative inline-flex shrink-0 items-center">
      <span className="pointer-events-none absolute left-2.5 text-near-ink">
        <SocialIcon platform={value} className="size-4" />
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SocialPlatform)}
        aria-label={t("platform")}
        className="h-9 w-32 appearance-none rounded-[var(--radius-btn)] border border-hairline bg-pure-snow pl-8 pr-2 text-[13px] text-near-ink transition-colors hover:border-mist-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {socialPlatforms.map((p) => (
          <option key={p} value={p}>
            {socialLabel(p, tSocial)}
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
  const t = useTranslations("features.careerPage.FooterPanel");

  return (
    <div className="space-y-4">
      <PanelHeader title={t("title")} subtitle={t("subtitle")} />

      <Group title={t("socialLinks")} defaultOpen errorPrefix="footer.socials">
        <ListEditor
          label={t("profiles")}
          itemName={t("link")}
          items={config.footer.socials}
          max={8}
          emptyText={t("socialsEmpty")}
          onAdd={() => update((d) => void d.footer.socials.push({ platform: "linkedin", url: "" }))}
          onRemove={(i) => update((d) => void d.footer.socials.splice(i, 1))}
          onRestore={(i, item) => update((d) => void d.footer.socials.splice(i, 0, item))}
          onMove={(i, dir) => update((d) => move(d.footer.socials, i, dir))}
          render={(item, i) => (
            <Field label={<span className="sr-only">{t("linkNumber", { number: i + 1 })}</span>} path={`footer.socials.${i}.url`}>
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

      <Group title={t("legalPages")} defaultOpen>
        {availableLegalPages.length === 0 ? (
          <p className="text-[12px] leading-snug text-soft-ink">
            {t("noLegalPages")}
          </p>
        ) : (
          availableLegalPages.map((slug) => {
            const checked = (config.footer.legalLinks ?? []).includes(slug);
            const legalKey = LEGAL_SLUG_KEYS[slug];
            return (
              <ToggleRow
                key={slug}
                label={legalKey ? t(`legal.${legalKey}`) : slug}
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
