import { SocialIcon, socialLabel } from "./social-icons";
import type { CareerPageConfig } from "./config";

const LEGAL_LINK_LABELS: Record<string, string> = {
  "privacy-policy": "Privacy Policy",
  "terms-of-service": "Terms of Service",
  "cookie-policy": "Cookie Policy",
  "candidate-notice": "Candidate Notice",
  "ai-transparency-notice": "AI Transparency",
};

export function CareerFooter({
  config,
  workspaceName,
  maxWidth = "max-w-5xl",
  iconRounded = "rounded-full",
}: {
  config: CareerPageConfig;
  workspaceName: string;
  maxWidth?: string;
  iconRounded?: string;
}) {
  const socials = config.footer.socials.filter((s) => s.url.trim());
  const legalLinks = config.footer.legalLinks ?? [];
  const year = new Date().getFullYear();

  return (
    <div className={`mx-auto ${maxWidth} px-6`}>
      {/* Top tier: brand + socials */}
      <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
        {/* Powered by Harly */}
        <a
          href="https://github.com/vytral/harly"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200"
        >
          <span className="text-xs font-medium">Powered by</span>
          {/* Black wordmark on light, white on dark — swapped via the .dark class
              set by ThemeWrapper. */}
          {/* eslint-disable @next/next/no-img-element */}
          <img
            src="/harly-full-black.svg"
            alt="Harly"
            className="h-6 w-auto opacity-70 transition-opacity group-hover:opacity-100 dark:hidden"
          />
          <img
            src="/harly-full-white.svg"
            alt="Harly"
            className="hidden h-6 w-auto opacity-70 transition-opacity group-hover:opacity-100 dark:block"
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
                aria-label={socialLabel(s.platform)}
                title={socialLabel(s.platform)}
                className={`flex size-9 items-center justify-center ${iconRounded} border border-zinc-200 text-zinc-500 transition-[transform,color,border-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:text-zinc-900 active:scale-95 motion-reduce:transition-none dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-100`}
              >
                <SocialIcon platform={s.platform} className="size-4" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Bottom tier: copyright + legal links */}
      <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-zinc-100 pt-6 text-xs text-zinc-400 dark:border-zinc-800/70 dark:text-zinc-500 sm:flex-row">
        <p>
          © {year} {workspaceName}
        </p>
        {legalLinks.length > 0 && (
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {legalLinks.map((slug) => (
              <a
                key={slug}
                href={`/legal/${slug}`}
                className="transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                {LEGAL_LINK_LABELS[slug] ?? slug}
              </a>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
