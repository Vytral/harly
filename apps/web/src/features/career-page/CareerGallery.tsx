import { safeImageUrl } from "./config";
import type { CareerPageConfig } from "./config";

export function CareerGallery({
  gallery,
  rounded = "rounded-3xl",
  aspectClass = "h-64 w-80",
}: {
  gallery: CareerPageConfig["gallery"];
  rounded?: string;
  aspectClass?: string;
}) {
  const images = gallery.images.map(safeImageUrl).filter(Boolean);
  if (!gallery.enabled || images.length === 0) return null;

  if (gallery.autoplay && images.length >= 2) {
    const track = [...images, ...images];
    return (
      <div className="group relative -mx-6 overflow-hidden px-6 [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
        <div
          className={`flex w-max gap-4 ${
            gallery.speed === "normal" ? "career-marquee-normal" : "career-marquee-slow"
          }`}
        >
          {track.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${i}-${src.slice(-12)}`}
              src={src}
              alt=""
              loading="lazy"
              className={`${aspectClass} shrink-0 ${rounded} bg-zinc-100 object-cover dark:bg-zinc-800`}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${i}-${src.slice(-12)}`}
          src={src}
          alt=""
          loading="lazy"
          className={`${aspectClass} shrink-0 ${rounded} bg-zinc-100 object-cover dark:bg-zinc-800`}
        />
      ))}
    </div>
  );
}
