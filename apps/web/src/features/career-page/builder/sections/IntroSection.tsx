import { Type } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { SectionProps } from "../types";
import { Section, Field, ListEditor, IconSelect, move } from "../primitives";

export function IntroSection({ config, update }: SectionProps) {
  return (
    <Section title="Intro & chips" icon={Type}>
      <Field label="Intro paragraph">
        <Textarea
          rows={4}
          value={config.intro.body}
          onChange={(e) => update((d) => (d.intro.body = e.target.value))}
        />
      </Field>
      <ListEditor
        label="Chips"
        items={config.intro.chips}
        onAdd={() =>
          update((d) => d.intro.chips.push({ label: "New", icon: "" }))
        }
        onRemove={(i) => update((d) => d.intro.chips.splice(i, 1))}
        onMove={(i, dir) => update((d) => move(d.intro.chips, i, dir))}
        render={(chip, i) => (
          <div className="flex gap-2">
            <Input
              value={chip.label}
              onChange={(e) =>
                update((d) => (d.intro.chips[i].label = e.target.value))
              }
              placeholder="Label"
              className="min-w-0"
            />
            <IconSelect
              value={chip.icon ?? ""}
              onChange={(v) => update((d) => (d.intro.chips[i].icon = v))}
            />
          </div>
        )}
      />
    </Section>
  );
}
