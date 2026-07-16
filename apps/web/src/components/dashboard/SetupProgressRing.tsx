import { cn } from "@/lib/utils";

/**
 * Compact circular progress ring (SVG stroke-dasharray). Used in the sidebar
 * "Get set up" entry and the checklist card header. Pure/stateless so it renders
 * on the server; the track + fill inherit brand colours via currentColor tokens.
 */
export function SetupProgressRing({
  percent,
  size = 20,
  strokeWidth = 2.5,
  className,
  showLabel = false,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showLabel?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <span
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted-foreground/25"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-pine transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      {showLabel ? (
        <span className="absolute text-[9px] font-semibold tabular-nums text-pine">
          {clamped}
        </span>
      ) : null}
    </span>
  );
}
