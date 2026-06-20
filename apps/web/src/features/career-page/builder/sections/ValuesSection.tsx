import { Sparkles } from "lucide-react";

import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { SectionProps } from "../types";
import { Section, Field, ToggleRow, ListEditor, move } from "../primitives";

export function ValuesSection({ config, update }: SectionProps) {
  return (
    <Section title="Values" icon={Sparkles}>
      <ToggleRow
        label="Show values"
        checked={config.values.enabled}
        onCheckedChange={(v) => update((d) => (d.values.enabled = v))}
      />
      <Field label="Title">
        <Input
          value={config.values.title}
          onChange={(e) => update((d) => (d.values.title = e.target.value))}
        />
      </Field>
      <ListEditor
        label={`Items (${config.values.items.length}/4)`}
        items={config.values.items}
        onAdd={() =>
          update((d) => {
            if (d.values.items.length >= 4) return;
            d.values.items.push({ title: "Value", body: "", art: "" });
          })
        }
        onRemove={(i) => update((d) => d.values.items.splice(i, 1))}
        onMove={(i, dir) => update((d) => move(d.values.items, i, dir))}
        render={(value, i) => (
          <div className="space-y-2">
            <Input
              value={value.title}
              onChange={(e) =>
                update((d) => (d.values.items[i].title = e.target.value))
              }
              placeholder="Title"
            />
            <Textarea
              rows={2}
              value={value.body}
              onChange={(e) =>
                update((d) => (d.values.items[i].body = e.target.value))
              }
              placeholder="Description"
            />
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">
                Image (optional — falls back to a colour tile)
              </span>
              <FileDropzone
                value={value.art || null}
                onChange={(url) =>
                  update((d) => (d.values.items[i].art = url ?? ""))
                }
              />
            </div>
          </div>
        )}
      />
      {config.values.items.length >= 4 && (
        <p className="text-[11px] text-muted-foreground">
          Maximum of 4 values reached.
        </p>
      )}
    </Section>
  );
}
