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
  logo,
  workspaceName,
  maxWidth = "max-w-5xl",
  iconRounded = "rounded-full",
}: {
  config: CareerPageConfig;
  logo: string | null;
  workspaceName: string;
  maxWidth?: string;
  iconRounded?: string;
}) {
  const socials = config.footer.socials.filter((s) => s.url.trim());
  const legalLinks = config.footer.legalLinks ?? [];

  return (
    <div className={`mx-auto ${maxWidth} px-6`}>
      <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-3">
        {/* Logo / brand */}
        <div className="flex items-center justify-center sm:justify-start">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={workspaceName}
              className="h-8 w-auto max-w-[160px] object-contain"
            />
          ) : (
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {workspaceName}
            </span>
          )}
        </div>

        {/* Center: powered by + legal links */}
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            Powered by{" "}
            <a
              href="https://github.com/vytral/harly"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Harly
            </a>
          </p>
          {legalLinks.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              {legalLinks.map((slug) => (
                <a
                  key={slug}
                  href={`/legal/${slug}`}
                  className="text-xs text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  {LEGAL_LINK_LABELS[slug] ?? slug}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Social icons */}
        <div className="flex items-center justify-center gap-2 sm:justify-end">
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
      </div>
    </div>
  );
}
