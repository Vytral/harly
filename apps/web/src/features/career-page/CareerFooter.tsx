import { useTranslations } from "next-intl";

import { CookiePreferencesButton } from "@/components/CookiePreferencesButton";

import { SocialIcon, socialLabel } from "./social-icons";
import type { CareerPageConfig } from "./config";

export function CareerFooter({
  config,
  workspaceName,
  maxWidth = "max-w-5xl",
  iconRounded = "rounded-full",
  portalEnabled = false,
  legalBasePath = "/legal",
}: {
  config: CareerPageConfig;
  workspaceName: string;
  maxWidth?: string;
  iconRounded?: string;
  portalEnabled?: boolean;
  legalBasePath?: string;
}) {
  const t = useTranslations("features.careerPage.careerFooter");
  const tSocial = useTranslations("labels.careerPage.social");
  const socials = config.footer.socials.filter((s) => s.url.trim());
  const legalLinks = config.footer.legalLinks ?? [];
  const year = new Date().getFullYear();
  const legalLabels: Record<string, string> = {
    "privacy-policy": t("legal.privacyPolicy"),
    "terms-of-service": t("legal.termsOfService"),
    "cookie-policy": t("legal.cookiePolicy"),
    "candidate-notice": t("legal.candidateNotice"),
    "ai-transparency-notice": t("legal.aiTransparencyNotice"),
  };

  return (
    <div className={`mx-auto ${maxWidth} px-6`}>
      {/* Top tier: brand + socials */}
      <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
        {/* Powered by Harly */}
        <a
          href="https://github.com/Vytral/harly"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 text-soft-ink transition-colors hover:text-near-ink"
        >
          <span className="text-xs font-medium">{t("poweredBy")}</span>
          {/* Black wordmark on light, white on dark , swapped via the .dark class
              set by ThemeWrapper. */}
          {/* eslint-disable @next/next/no-img-element */}
          <img
            src="/harly-full-black.svg"
            alt="Harly"
            className="h-6 w-auto opacity-80 transition-opacity group-hover:opacity-100 dark:hidden"
          />
          <img
            src="/harly-full-white.svg"
            alt="Harly"
            className="hidden h-6 w-auto opacity-80 transition-opacity group-hover:opacity-100 dark:block"
          />
          {/* eslint-enable @next/next/no-img-element */}
        </a>

        {/* Social icons */}
        {socials.length > 0 && (
          <div className="flex items-center gap-2">
            {socials.map((s, i) => (
              <a
                key={`${s.platform}-${i}`}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={socialLabel(s.platform, tSocial)}
                title={socialLabel(s.platform, tSocial)}
                className={`flex size-9 items-center justify-center ${iconRounded} border border-hairline text-soft-ink transition-[transform,color,border-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:text-near-ink active:scale-95 motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
              >
                <SocialIcon platform={s.platform} className="size-4" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Bottom tier: copyright + legal links */}
      <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-hairline pt-6 text-xs text-soft-ink sm:flex-row">
        <p>{t("copyright", { year, workspaceName })}</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {portalEnabled ? (
            <a
              href="/portal"
              className="transition-colors hover:text-near-ink"
            >
              {t("candidatePortal")}
            </a>
          ) : null}
          {legalLinks.map((slug) => (
            <a
              key={slug}
              href={`${legalBasePath}/${slug}`}
              className="transition-colors hover:text-near-ink"
            >
              {legalLabels[slug] ?? slug}
            </a>
          ))}
          <CookiePreferencesButton />
        </nav>
      </div>
    </div>
  );
}
