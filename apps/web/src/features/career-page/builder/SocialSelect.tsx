import type { SocialPlatform } from "@/features/career-page/config";
import { socialPlatforms } from "@/features/career-page/config";
import {
  SocialIcon,
  socialLabel,
} from "@/features/career-page/social-icons";

export function SocialSelect({
  value,
  onChange,
}: {
  value: SocialPlatform;
  onChange: (p: SocialPlatform) => void;
}) {
  return (
    <div className="relative inline-flex shrink-0 items-center">
      <span className="pointer-events-none absolute left-2.5 text-foreground">
        <SocialIcon platform={value} className="size-4" />
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SocialPlatform)}
        aria-label="Platform"
        className="h-10 w-32 appearance-none rounded-md border bg-background pl-8 pr-3 text-sm transition-colors duration-150 ease hover:border-zinc-300 focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine/20"
      >
        {socialPlatforms.map((p) => (
          <option key={p} value={p}>
            {socialLabel(p)}
          </option>
        ))}
      </select>
    </div>
  );
}
