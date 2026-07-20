"use client";

import Link from "next/link";
import type { Route } from "next";
import { SocialIcon, socialLabel } from "@/features/career-page/social-icons";
import type { CareerSocialLink } from "@/features/career-page/config";

const LEGAL_LINK_LABELS: Record<string, string> = {
  "privacy-policy": "Privacy Policy",
  "terms-of-service": "Terms of Service",
  "cookie-policy": "Cookie Policy",
  "candidate-notice": "Candidate Notice",
  "ai-transparency-notice": "AI Transparency",
};

type PortalFooterProps = {
  orgName: string;
  orgLogo: string | null;
  orgFullLogoUrl: string | null;
  orgFullLogoDarkUrl: string | null;
  orgColor: string | null;
  socials: CareerSocialLink[];
  legalLinks: string[];
  year: number;
};

export function PortalFooter({
  orgName,
  orgLogo,
  orgFullLogoUrl,
  orgFullLogoDarkUrl,
  orgColor,
  socials,
  legalLinks,
  year,
}: PortalFooterProps) {
  const accentColor = orgColor ?? "#3f6212";
  const visibleSocials = socials.filter((s) => s.url.trim());

  return (
    <footer className="mt-16 border-t border-border bg-muted/20">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Top tier: brand + socials */}
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Workspace brand */}
          <Link href={"/portal/dashboard" as Route} className="flex items-center gap-2.5">
            {orgFullLogoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- external URL from workspace */}
                <img
                  src={orgFullLogoUrl}
                  alt={orgName}
                  className={orgFullLogoDarkUrl ? "h-8 max-w-[180px] object-contain dark:hidden" : "h-8 max-w-[180px] object-contain"}
                />
                {orgFullLogoDarkUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- external URL from workspace
                  <img
                    src={orgFullLogoDarkUrl}
                    alt={orgName}
                    className="hidden h-8 max-w-[180px] object-contain dark:block"
                  />
                )}
              </>
            ) : orgLogo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- external URL from workspace */}
                <img src={orgLogo} alt={orgName} className="size-9 rounded-lg object-cover" />
                <span className="font-display text-base font-semibold text-foreground">{orgName}</span>
              </>
            ) : (
              <>
                <span
                  className="flex size-9 items-center justify-center rounded-lg text-sm font-bold text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  {orgName.charAt(0).toUpperCase()}
                </span>
                <span className="font-display text-base font-semibold text-foreground">{orgName}</span>
              </>
            )}
          </Link>

          {/* Social icons */}
          {visibleSocials.length > 0 && (
            <div className="flex items-center gap-2">
              {visibleSocials.map((s, i) => (
                <a
                  key={`${s.platform}-${i}`}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={socialLabel(s.platform)}
                  title={socialLabel(s.platform)}
                  className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:text-foreground active:scale-95 motion-reduce:transition-none"
                >
                  <SocialIcon platform={s.platform} className="size-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Bottom tier: copyright + legal + powered by */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <p>
              © {year} {orgName}
            </p>
            {legalLinks.map((slug) => (
              <a
                key={slug}
                href={`/legal/${slug}`}
                className="transition-colors hover:text-foreground"
              >
                {LEGAL_LINK_LABELS[slug] ?? slug}
              </a>
            ))}
          </div>

          {/* Powered by Harly */}
          <a
            href="https://github.com/Vytral/harly"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="font-medium">Powered by</span>
            <span className="font-display font-semibold text-foreground">Harly</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
