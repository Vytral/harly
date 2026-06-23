"use client";

import { cn } from "@/lib/utils";

interface AiButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  size?: "sm" | "default";
  variant?: "default" | "ghost" | "outline";
}

export function AiButton({
  children,
  loading = false,
  loadingText,
  size = "default",
  variant = "default",
  className,
  disabled,
  ...props
}: AiButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      disabled={isDisabled}
      className={cn(
        "relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "active:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-60",
        // Size
        size === "sm"
          ? "h-8 px-3 text-[13px]"
          : "h-9 px-3.5 text-sm",
        // Variant
        variant === "default" && [
          "bg-primary text-primary-foreground shadow-sm",
          "hover:bg-primary/90",
          // shimmer overlay
          "before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent",
          !loading && "hover:before:animate-[shimmer_600ms_ease-out_forwards]",
        ],
        variant === "ghost" && [
          "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        ],
        variant === "outline" && [
          "border border-border bg-background text-foreground hover:bg-accent",
          "before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-primary/8 before:to-transparent",
          !loading && "hover:before:animate-[shimmer_600ms_ease-out_forwards]",
        ],
        "@media (prefers-reduced-motion: reduce) { before:hidden }",
        className,
      )}
    >
      {/* Wand-sparkles icon (inline SVG — no import needed) */}
      <span className="shrink-0" aria-hidden>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* wand-sparkles */}
          <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
          <path d="m14 7 3 3" />
          <path d="M5 6v4" />
          <path d="M19 14v4" />
          <path d="M10 2v2" />
          <path d="M7 8H3" />
          <path d="M21 16h-4" />
          <path d="M11 3H9" />
        </svg>
      </span>

      {loading ? (
        <span className="flex items-center gap-0.5">
          {loadingText ?? "Generating"}
          <span className="ml-0.5 inline-flex items-end gap-px pb-px">
            <span className="size-1 rounded-full bg-current motion-safe:animate-[bounce_1s_ease-in-out_infinite]" style={{ animationDelay: "0ms" }} />
            <span className="size-1 rounded-full bg-current motion-safe:animate-[bounce_1s_ease-in-out_infinite]" style={{ animationDelay: "150ms" }} />
            <span className="size-1 rounded-full bg-current motion-safe:animate-[bounce_1s_ease-in-out_infinite]" style={{ animationDelay: "300ms" }} />
          </span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
