"use client";

import { writeCookiePreferences } from "@/lib/cookie-consent";
import { cn } from "@/lib/utils";

import { useEmbedConsent } from "./use-embed-consent";

export function EmbedConsentPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-5 text-center dark:border-zinc-700 dark:bg-zinc-900",
        className,
      )}
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        This content is embedded from another site. It stays off until you allow embeds.
      </p>
      <button
        type="button"
        onClick={() => writeCookiePreferences(true)}
        className="mt-3 inline-flex items-center justify-center rounded-xl bg-zinc-900 px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Allow embeds
      </button>
    </div>
  );
}

export function ThirdPartyEmbed({
  src,
  title,
  className,
}: {
  src: string;
  title: string;
  className?: string;
}) {
  const allowed = useEmbedConsent();
  if (!allowed) return <EmbedConsentPlaceholder className="mt-3 h-auto" />;
  return (
    <iframe
      src={src}
      title={title}
      className={className}
      loading="lazy"
    />
  );
}
