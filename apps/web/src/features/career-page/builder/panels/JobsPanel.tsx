"use client";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { CareerPageConfig } from "@/features/career-page/config";
import type { ConfigUpdater } from "../types";
import { Field } from "../primitives";
import { PanelHeader, Section } from "./PanelKit";

export function JobsPanel({ config, update }: { config: CareerPageConfig; update: ConfigUpdater }) {
  return (
    <div className="space-y-6">
      <PanelHeader title="Jobs" subtitle="Configure the open positions section." />

      <Section title="Open positions" defaultOpen>
        <Field label="Section title">
          <Input
            value={config.positions.title}
            onChange={(e) => update((d) => (d.positions.title = e.target.value))}
            placeholder="Open positions"
          />
        </Field>
        <Field label="Filters">
          {config.template === "playful" || config.template === "ashby" ? (
            <div className="flex flex-wrap gap-2">
              {(config.template === "playful"
                ? ["department"]
                : ["department", "location", "type"]
              ).map((f) => {
                const filter = f as "department" | "location" | "type";
                const on = config.positions.filters.includes(filter);
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() =>
                      update((d) => {
                        d.positions.filters = on
                          ? d.positions.filters.filter((x) => x !== filter)
                          : [...d.positions.filters, filter];
                      })
                    }
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm capitalize transition-colors",
                      on
                        ? "border-pine/40 bg-sage/60 text-pine"
                        : "border-border text-ink-soft hover:border-pine/20 hover:text-foreground",
                    )}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs leading-5 text-ink-soft">
              Filters are available in the Playful and Ashby templates.
            </p>
          )}
        </Field>
      </Section>
    </div>
  );
}
