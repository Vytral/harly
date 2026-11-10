"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const PRESETS = [15, 30, 45, 60, 90, 120] as const;

export function DurationInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (mins: number) => void;
  label?: string;
}) {
  const t = useTranslations("features.candidates.DurationInput");
  return (
    <div className="space-y-2">
      <label className="text-[13px] font-medium tracking-tight text-foreground/90">
        {label ?? t("label")}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
              value === preset
                ? "border-primary/40 bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t("presetMinutes", { minutes: preset })}
          </button>
        ))}
      </div>
      <div className="relative">
        <input
          type="number"
          min={5}
          max={480}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= 5 && n <= 480) onChange(n);
          }}
          className="h-9 w-full rounded-lg border bg-transparent px-3 text-base sm:text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring/20"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {t("unit")}
        </span>
      </div>
    </div>
  );
}
