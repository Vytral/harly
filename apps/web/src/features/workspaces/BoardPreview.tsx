import { cn } from "@/lib/utils";
import type { BoardStyle, LogoStyle } from "@/features/workspaces/board";

type BoardPreviewProps = {
  name: string;
  slug: string;
  logoUrl: string | null;
  tagline: string | null;
  heroImageUrl: string | null;
  primaryColor: string;
  boardStyle: BoardStyle;
  logoStyle: LogoStyle;
};

const SAMPLE_JOBS = [
  { title: "Senior Product Designer", meta: "Design · Remote" },
  { title: "Backend Engineer", meta: "Engineering · Berlin" },
  { title: "Talent Partner", meta: "People · Hybrid" },
];

/**
 * A faithful, scaled-down preview of the public careers board — updates live as
 * branding changes so recruiters see exactly what candidates will. The settings
 * signature element (replaces the old gray-box style mockups).
 */
export function BoardPreview({
  name,
  slug,
  logoUrl,
  tagline,
  heroImageUrl,
  primaryColor,
  boardStyle,
  logoStyle,
}: BoardPreviewProps) {
  const initial = (name.charAt(0) || "W").toUpperCase();
  const onHero = boardStyle === "hero";

  const logo = (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-sm font-semibold text-ink",
        logoStyle === "bordered" && "border border-black/10 shadow-sm",
      )}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={name}
          className="size-full object-cover"
        />
      ) : (
        initial
      )}
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
        <span className="size-2 rounded-full bg-rust/50" />
        <span className="size-2 rounded-full bg-clay/50" />
        <span className="size-2 rounded-full bg-pine/40" />
        <span className="ml-2 truncate rounded bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          harly.app/board/{slug || "your-company"}
        </span>
      </div>

      {/* Header */}
      {onHero ? (
        <div
          className="relative px-4 py-5"
          style={{
            backgroundImage: heroImageUrl
              ? `url(${heroImageUrl})`
              : `linear-gradient(135deg, ${primaryColor}, ${primaryColor}bb)`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {heroImageUrl ? (
            <div className="absolute inset-0 bg-ink/40" />
          ) : null}
          <div className="relative flex items-center gap-3">
            {logo}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {name || "Your company"}
              </p>
              <p className="truncate text-xs text-white/80">
                {tagline || "Your careers tagline"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-b px-4 py-4">
          <div className="flex items-center gap-3">
            {logo}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {name || "Your company"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {tagline || "Your careers tagline"}
              </p>
            </div>
          </div>
          <div
            className="mt-3 h-0.5 w-12 rounded-full"
            style={{ backgroundColor: primaryColor }}
          />
        </div>
      )}

      {/* Open roles */}
      <div className="space-y-2 p-3">
        <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Open roles
        </p>
        {SAMPLE_JOBS.map((job) => (
          <div
            key={job.title}
            className="flex items-center justify-between rounded-lg border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{job.title}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {job.meta}
              </p>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: primaryColor }}
            >
              Apply
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
