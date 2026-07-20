"use client";

import { cn } from "@/lib/utils";

type InterviewDateBadgeProps = {
  date: Date;
  variant?: "default" | "compact";
};

export function InterviewDateBadge({ date, variant = "default" }: InterviewDateBadgeProps) {
  const dayOfWeek = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date).toUpperCase();
  const dayNum = new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase();

  if (variant === "compact") {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl bg-pine/10 dark:bg-pine/15 px-3 py-2 text-center">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {dayOfWeek}
        </span>
        <span className="mt-0.5 text-lg font-bold leading-none text-foreground">
          {dayNum}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-sage/40 px-4 py-3 text-center dark:bg-sage/20">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {dayOfWeek}
      </span>
      <span className="mt-1 text-2xl font-bold leading-none text-foreground">
        {dayNum}
      </span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {month}
      </span>
    </div>
  );
}