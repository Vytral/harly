"use client";

import { useTranslations } from "next-intl";

import type { CareerTestimonial } from "./config";
import { safeImageUrl } from "./config";
import { CareerMarquee } from "./CareerMarquee";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

/**
 * Colours come from the template's CSS variables (`--career-accent`,
 * `--career-tint`, `--career-tint-ink`: contrast-checked, dark-mode aware); the
 * `accent` prop is only the fallback when a caller has not set them.
 */
function Card({ t, accent, fixedWidth }: { t: CareerTestimonial; accent: string; fixedWidth: boolean }) {
  const avatarUrl = safeImageUrl(t.avatar);
  return (
    <figure
      className={`flex shrink-0 flex-col justify-between rounded-[var(--career-r-card,16px)] border border-hairline bg-pure-snow p-6 ${
        fixedWidth ? "w-80" : "w-full"
      }`}
    >
      <span
        className="text-4xl leading-none"
        style={{ color: `var(--career-accent, ${accent})` }}
        aria-hidden
      >
        &ldquo;
      </span>
      <blockquote className="mt-2 text-base leading-relaxed text-near-ink">{t.quote}</blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        {avatarUrl ? (
          // Name sits right next to the photo, so the image itself is decorative.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={{
              backgroundColor: `var(--career-tint, ${accent})`,
              color: "var(--career-tint-ink, #171717)",
            }}
          >
            {initials(t.name) || "?"}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-near-ink">{t.name}</span>
          {t.role && <span className="block truncate text-sm text-soft-ink">{t.role}</span>}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Testimonial cards. With 3+ quotes: an auto-scrolling strip (pausable, stops
 * for reduced motion). With 1 or 2: a static grid, since looping two cards
 * reads as a glitch.
 */
export function CareerTestimonials({
  items,
  accent,
}: {
  items: CareerTestimonial[];
  accent: string;
}) {
  const t = useTranslations("features.careerPage.careerTestimonials");
  if (items.length === 0) return null;

  if (items.length >= 3) {
    return (
      <CareerMarquee label={t("label")} gap="gap-5">
        {items.map((t, i) => (
          <Card key={`${i}-${t.name}`} t={t} accent={accent} fixedWidth />
        ))}
      </CareerMarquee>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {items.map((t, i) => (
        <Card key={`${i}-${t.name}`} t={t} accent={accent} fixedWidth={false} />
      ))}
    </div>
  );
}
