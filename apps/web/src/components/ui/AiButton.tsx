"use client";

import { HarlyAILogoMark } from "@/components/ui/icons/HarlyAILogoMark";
import { cn } from "@/lib/utils";

interface AiButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  size?: "sm" | "default";
  variant?: "default" | "ghost" | "outline";
  logoClassName?: string;
}

export function AiButton({
  children,
  loading = false,
  loadingText,
  size = "default",
  variant = "default",
  logoClassName,
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
        "relative inline-flex items-center gap-1.5 rounded-lg font-medium transition-all",
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
        ],
        variant === "ghost" && [
          "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        ],
        variant === "outline" && [
          "border border-border bg-background text-foreground hover:bg-accent",
        ],
        className,
      )}
    >
      <HarlyAILogoMark className={cn("size-3.5 shrink-0", logoClassName)} />
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
