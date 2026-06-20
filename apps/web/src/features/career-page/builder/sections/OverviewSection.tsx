import { BarChart3 } from "lucide-react";

import { Input } from "@/components/ui/input";

import type { SectionProps } from "../types";
import { Section, Field, ToggleRow, ListEditor, IconSelect, move } from "../primitives";

export function OverviewSection({ config, update }: SectionProps) {
  return (
    <Section title="Overview card" icon={BarChart3}>
      <ToggleRow
        label="Show overview card"
        checked={config.overview.enabled}
        onCheckedChange={(v) => update((d) => (d.overview.enabled = v))}
      />
      <Field label="Title">
        <Input
          value={config.overview.title}
          onChange={(e) =>
            update((d) => (d.overview.title = e.target.value))
          }
        />
      </Field>
      <ListEditor
        label="Stats"
        items={config.overview.stats}
        onAdd={() =>
          update((d) =>
            d.overview.stats.push({ label: "Label", value: "", icon: "" }),
          )
        }
        onRemove={(i) => update((d) => d.overview.stats.splice(i, 1))}
        onMove={(i, dir) => update((d) => move(d.overview.stats, i, dir))}
        render={(stat, i) => (
          <div className="flex gap-2">
            <Input
              value={stat.label}
              onChange={(e) =>
                update((d) => (d.overview.stats[i].label = e.target.value))
              }
              placeholder="Label"
              className="min-w-0 flex-1"
            />
            <Input
              value={stat.value}
              onChange={(e) =>
                update((d) => (d.overview.stats[i].value = e.target.value))
              }
              placeholder="Value"
              className="w-20 shrink-0"
            />
            <IconSelect
              value={stat.icon ?? ""}
              onChange={(v) => update((d) => (d.overview.stats[i].icon = v))}
            />
          </div>
        )}
      />
    </Section>
  );
}
