import { useTranslations } from "next-intl";

import { safeImageUrl } from "./config";
import type { CareerPageConfig } from "./config";
import { CareerMarquee } from "./CareerMarquee";

/**
 * Photo strip. Images are decorative (the config stores bare URLs, no
 * captions), so they carry an empty alt and the strip is labelled as a region.
 * Auto-scrolls when `autoplay` is on and there are 2+ photos; otherwise a
 * keyboard-scrollable row.
 */
export function CareerGallery({
  gallery,
  rounded = "rounded-[var(--career-r-card,16px)]",
  aspectClass = "h-64 w-80",
  label: labelProp,
}: {
  gallery: CareerPageConfig["gallery"];
  rounded?: string;
  aspectClass?: string;
  label?: string;
}) {
  const t = useTranslations("features.careerPage.careerGallery");
  const label = labelProp ?? t("label");
  const images = gallery.images.map(safeImageUrl).filter((u): u is string => u !== null);
  if (!gallery.enabled || images.length === 0) return null;

  const imgClass = `${aspectClass} shrink-0 ${rounded} bg-card-inset object-cover`;

  if (gallery.autoplay && images.length >= 2) {
    return (
      <CareerMarquee speed={gallery.speed} label={label}>
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${i}-${src.slice(-12)}`} src={src} alt="" loading="lazy" className={imgClass} />
        ))}
      </CareerMarquee>
    );
  }

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-2"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${i}-${src.slice(-12)}`} src={src} alt="" loading="lazy" className={imgClass} />
      ))}
    </div>
  );
}
