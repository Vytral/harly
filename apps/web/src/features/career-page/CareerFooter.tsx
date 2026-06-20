import { SocialIcon, socialLabel } from "./social-icons";
import type { CareerPageConfig } from "./config";

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

  return (
    <div className={`mx-auto grid ${maxWidth} grid-cols-1 items-center gap-6 px-6 sm:grid-cols-3`}>
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

      <div className="text-center text-sm text-zinc-400 dark:text-zinc-500">
        Powered by{" "}
        <a
          href="https://github.com/vytral/harly"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Harly
        </a>
      </div>

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
  );
}
