"use client";

type PortalHeroBannerProps = {
  orgName: string;
  orgColor: string | null;
  heroImageUrl: string | null;
};

export function PortalHeroBanner({
  orgName,
  orgColor,
  heroImageUrl,
}: PortalHeroBannerProps) {
  const accentColor = orgColor ?? "#0f4c4c";

  return (
    <div
      className="relative overflow-hidden rounded-3xl"
      style={{ backgroundColor: accentColor }}
    >
      {/* Background: workspace hero image, else geometric fallback */}
      {heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- workspace-managed public asset
        <img
          src={heroImageUrl}
          alt={`${orgName} banner`}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0">
          <svg
            className="absolute inset-0 h-full w-full"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <pattern id="hero-pattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
                <circle cx="50" cy="50" r="40" fill="#fbbf24" />
                <circle cx="150" cy="50" r="40" fill="#fb923c" />
                <circle cx="50" cy="150" r="40" fill="#a3e635" />
                <circle cx="150" cy="150" r="40" fill="#22d3ee" />
                <path d="M 50 10 Q 90 50 50 90 Q 10 50 50 10 Z" fill="#84cc16" />
                <path d="M 150 10 Q 190 50 150 90 Q 110 50 150 10 Z" fill="#0891b2" />
                <path d="M 50 110 Q 90 150 50 190 Q 10 150 50 110 Z" fill="#ef4444" />
                <path d="M 150 110 Q 190 150 150 190 Q 110 150 150 110 Z" fill="#fbbf24" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-pattern)" />
          </svg>
          {/* Fade pattern into solid accent on the right */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(90deg, transparent 0%, transparent 35%, ${accentColor} 85%)`,
            }}
          />
        </div>
      )}

      {/* Height spacer */}
      <div className="min-h-40 md:min-h-52" />
    </div>
  );
}
