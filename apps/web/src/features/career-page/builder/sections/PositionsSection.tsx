import { Briefcase } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { SectionProps } from "../types";
import { Section, Field } from "../primitives";

export function PositionsSection({ config, update }: SectionProps) {
  return (
    <Section title="Open positions" icon={Briefcase}>
      <Field label="Section title">
        <Input
          value={config.positions.title}
          onChange={(e) =>
            update((d) => (d.positions.title = e.target.value))
          }
        />
      </Field>
      <Field label="Filters">
        <div className="flex flex-wrap gap-2">
          {(["department", "location", "type"] as const).map((f) => {
            const on = config.positions.filters.includes(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() =>
                  update((d) => {
                    d.positions.filters = on
                      ? d.positions.filters.filter((x) => x !== f)
                      : [...d.positions.filters, f];
                  })
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs capitalize transition-colors",
                  on
                    ? "border-pine bg-sage/40 text-sage-ink"
                    : "text-muted-foreground",
                )}
              >
                {f}
              </button>
            );
          })}
        </div>
      </Field>
    </Section>
  );
}
