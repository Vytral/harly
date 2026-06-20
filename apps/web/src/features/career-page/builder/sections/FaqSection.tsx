import { HelpCircle } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { SectionProps } from "../types";
import { Section, Field, ToggleRow, ListEditor, move } from "../primitives";

export function FaqSection({ config, update }: SectionProps) {
  return (
    <Section title="FAQ" icon={HelpCircle}>
      <ToggleRow
        label="Show FAQ"
        checked={config.faq.enabled}
        onCheckedChange={(v) => update((d) => (d.faq.enabled = v))}
      />
      <Field label="Title">
        <Input
          value={config.faq.title}
          onChange={(e) => update((d) => (d.faq.title = e.target.value))}
        />
      </Field>
      <ListEditor
        label="Questions"
        items={config.faq.items}
        onAdd={() =>
          update((d) => d.faq.items.push({ q: "Question", a: "" }))
        }
        onRemove={(i) => update((d) => d.faq.items.splice(i, 1))}
        onMove={(i, dir) => update((d) => move(d.faq.items, i, dir))}
        render={(item, i) => (
          <div className="space-y-2">
            <Input
              value={item.q}
              onChange={(e) =>
                update((d) => (d.faq.items[i].q = e.target.value))
              }
              placeholder="Question"
            />
            <Textarea
              rows={3}
              value={item.a}
              onChange={(e) =>
                update((d) => (d.faq.items[i].a = e.target.value))
              }
              placeholder="Answer"
            />
          </div>
        )}
      />
    </Section>
  );
}
