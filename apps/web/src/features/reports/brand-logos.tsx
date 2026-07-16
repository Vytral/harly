"use client";

/**
 * Brand marks for application sources (LinkedIn, Indeed, …).
 *
 * Inlined SVGs (via theSVG) so we ship no runtime icon dependency, mirroring
 * `icons/phosphor.tsx`. Marks keep their official brand colour — they read as
 * small colour chips beside each source row. Unknown sources fall back to a
 * neutral globe drawn in `currentColor`.
 *
 * `applications.source` is freeform text, so we normalise loosely: lowercase,
 * strip non-alphanumerics, then match known aliases.
 */

type LogoProps = { className?: string };

function LinkedInLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 256 256" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid">
      <path
        fill="#0A66C2"
        d="M218.123 218.127h-37.931v-59.403c0-14.165-.253-32.4-19.728-32.4-19.756 0-22.779 15.434-22.779 31.369v60.43h-37.93V95.967h36.413v16.694h.51a39.907 39.907 0 0 1 35.928-19.733c38.445 0 45.533 25.288 45.533 58.186l-.016 67.013ZM56.955 79.27c-12.157.002-22.014-9.852-22.016-22.009-.002-12.157 9.851-22.014 22.008-22.016 12.157-.003 22.014 9.851 22.016 22.008A22.013 22.013 0 0 1 56.955 79.27m18.966 138.858H37.95V95.967h37.97v122.16ZM237.033.018H18.89C8.58-.098.125 8.161-.001 18.471v219.053c.122 10.315 8.576 18.582 18.89 18.474h218.144c10.336.128 18.823-8.139 18.966-18.474V18.454c-.147-10.33-8.635-18.588-18.966-18.453"
      />
    </svg>
  );
}

function IndeedLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="#003A9B">
      <path d="M11.566 21.5633v-8.762c.2553.0231.5009.0346.758.0346 1.2225 0 2.3739-.3206 3.3506-.8928v9.6182c0 .8219-.1957 1.4287-.5757 1.8338-.378.4033-.8808.6049-1.491.6049-.6007 0-1.0766-.2016-1.468-.6183-.3781-.4032-.5739-1.01-.5739-1.8184zM11.589.5659c2.5447-.8929 5.4424-.8449 7.6186.987.405.3687.8673.8334 1.0515 1.3806.2207.6913-.7695-.073-.9057-.167-.71-.4532-1.4182-.8334-2.2127-1.0946C12.8614.3873 8.8122 2.709 6.2945 6.315c-1.0516 1.5939-1.7367 3.2721-2.299 5.1174-.0614.2017-.1094.4647-.2207.6413-.1113.2036-.048-.5453-.048-.5702.0845-.7623.2438-1.4997.4414-2.237C5.3292 5.3375 7.897 2.0655 11.5891.5658zm4.9281 7.0587c0 1.6686-1.353 3.0224-3.0205 3.0224-1.6677 0-3.0186-1.3538-3.0186-3.0224 0-1.6687 1.351-3.0224 3.0186-3.0224 1.6676 0 3.0205 1.3518 3.0205 3.0224Z" />
    </svg>
  );
}

function GlassdoorLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="#00A162">
      <path d="M14.1093.0006c-.0749-.0074-.1348.0522-.1348.127v3.451c0 .0673.0537.1194.121.127 2.619.172 4.6092.9501 4.6092 3.6814H13.086a.1343.1343 0 0 0-.1348.1347v8.9644c0 .0748.06.1347.1348.1347h10.0034c.0748 0 .1347-.0599.1347-.1347V7.342c0-2.2374-.7996-4.0558-2.4159-5.3279C19.3191.8469 17.0874.1428 14.1093.0006ZM.9107 7.387a.1342.1342 0 0 0-.1347.1347v8.9566c0 .0748.06.1347.1347.1347h5.6189c0 2.7313-1.9902 3.5094-4.6091 3.6815-.0674.0075-.1192.0596-.1192.127v3.451c0 .0747.06.1343.1348.1269 2.9781-.1422 5.2078-.8463 6.6969-2.0136 1.6163-1.272 2.4159-3.0905 2.4159-5.3278V7.5217a.1343.1343 0 0 0-.1348-.1347z" />
    </svg>
  );
}

function GreenhouseLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="#24A47F">
      <path d="M16.279 7.13c0 1.16-.49 2.185-1.293 2.987-.891.891-2.184 1.114-2.184 1.872 0 1.025 1.65.713 3.231 2.295 1.048 1.047 1.694 2.43 1.694 4.034C17.727 21.482 15.187 24 12 24c-3.187 0-5.727-2.518-5.727-5.68 0-1.607.646-2.989 1.694-4.036 1.582-1.582 3.23-1.27 3.23-2.295 0-.758-1.292-.98-2.183-1.872-.802-.802-1.293-1.827-1.293-3.03 0-2.318 1.895-4.19 4.212-4.19.446 0 .847.067 1.181.067.602 0 .914-.268.914-.691 0-.245-.112-.557-.112-.891 0-.758.647-1.382 1.427-1.382s1.404.646 1.404 1.426c0 .825-.647 1.204-1.137 1.382-.401.134-.713.312-.713.713 0 .758 1.382 1.493 1.382 3.61zm-.446 11.19c0-2.206-1.627-3.99-3.833-3.99-2.206 0-3.833 1.784-3.833 3.99 0 2.184 1.627 3.989 3.833 3.989 2.206 0 3.833-1.808 3.833-3.99zM14.518 7.086c0-1.404-1.136-2.562-2.518-2.562S9.482 5.682 9.482 7.086 10.618 9.65 12 9.65s2.518-1.159 2.518-2.563z" />
    </svg>
  );
}

function WellfoundLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M23.998 8.128c.063-1.379-1.612-2.376-2.795-1.664-1.23.598-1.322 2.52-.156 3.234 1.2.862 2.995-.09 2.951-1.57zm0 7.748c.063-1.38-1.612-2.377-2.795-1.665-1.23.598-1.322 2.52-.156 3.234 1.2.863 2.995-.09 2.951-1.57zm-20.5 1.762L0 6.364h3.257l2.066 8.106 2.245-8.106h3.267l2.244 8.106 2.065-8.106h3.257l-3.54 11.274H11.39c-.73-2.713-1.46-5.426-2.188-8.14l-2.233 8.14H3.5z" />
    </svg>
  );
}

function MonsterLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="#6D4C9F">
      <path d="M0 0V24H5.42V12.39L12 18.19L18.58 12.39V24H24V0L12 11.23L0 0Z" />
    </svg>
  );
}

function GlobeLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 256 256" className={className} aria-hidden="true" fill="currentColor">
      <path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m88 104a87.6 87.6 0 0 1-3.33 24h-38.51a157.4 157.4 0 0 0 0-48h38.51a87.6 87.6 0 0 1 3.33 24m-114 40h52a115.1 115.1 0 0 1-26 45a115.1 115.1 0 0 1-26-45m-3.9-16a140.8 140.8 0 0 1 0-48h59.86a140.8 140.8 0 0 1 0 48ZM40 128a87.6 87.6 0 0 1 3.33-24h38.51a157.4 157.4 0 0 0 0 48H43.33A87.6 87.6 0 0 1 40 128m114-40h-52a115.1 115.1 0 0 1 26-45a115.1 115.1 0 0 1 26 45m52.33 0h-36.15a135.7 135.7 0 0 0-22.2-45.63A88.37 88.37 0 0 1 206.37 88ZM81.82 42.37A135.7 135.7 0 0 0 59.62 88H23.63a88.37 88.37 0 0 1 58.19-45.63M23.63 168h35.99a135.7 135.7 0 0 0 22.2 45.63A88.37 88.37 0 0 1 23.63 168m150.55 45.63a135.7 135.7 0 0 0 22.2-45.63h35.99a88.37 88.37 0 0 1-58.19 45.63" />
    </svg>
  );
}

const BRAND_MAP: Record<string, (p: LogoProps) => React.ReactElement> = {
  linkedin: LinkedInLogo,
  indeed: IndeedLogo,
  glassdoor: GlassdoorLogo,
  greenhouse: GreenhouseLogo,
  wellfound: WellfoundLogo,
  angellist: WellfoundLogo,
  monster: MonsterLogo,
};

function normalize(source: string): string {
  return source.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Brand mark for an application source, falling back to a neutral globe. */
export function SourceLogo({ source, className }: { source: string; className?: string }) {
  const Logo = BRAND_MAP[normalize(source)] ?? GlobeLogo;
  return <Logo className={className} />;
}
