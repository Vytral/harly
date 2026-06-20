import { Quote } from "lucide-react";

import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { SectionProps } from "../types";
import { Section, Field, ToggleRow, ListEditor, move } from "../primitives";

export function TestimonialsSection({ config, update }: SectionProps) {
  return (
    <Section title="Testimonials" icon={Quote}>
      <ToggleRow
        label="Show testimonials"
        checked={config.testimonials.enabled}
        onCheckedChange={(v) => update((d) => (d.testimonials.enabled = v))}
      />
      <Field label="Title">
        <Input
          value={config.testimonials.title}
          onChange={(e) =>
            update((d) => (d.testimonials.title = e.target.value))
          }
        />
      </Field>
      <ListEditor
        label="Items"
        items={config.testimonials.items}
        onAdd={() =>
          update((d) =>
            d.testimonials.items.push({ quote: "", name: "", role: "", avatar: "" }),
          )
        }
        onRemove={(i) => update((d) => d.testimonials.items.splice(i, 1))}
        onMove={(i, dir) => update((d) => move(d.testimonials.items, i, dir))}
        render={(item, i) => (
          <div className="space-y-2">
            <Textarea
              rows={3}
              value={item.quote}
              onChange={(e) =>
                update((d) => (d.testimonials.items[i].quote = e.target.value))
              }
              placeholder="Quote"
            />
            <div className="flex gap-2">
              <Input
                value={item.name}
                onChange={(e) =>
                  update((d) => (d.testimonials.items[i].name = e.target.value))
                }
                placeholder="Name"
                className="min-w-0 flex-1"
              />
              <Input
                value={item.role}
                onChange={(e) =>
                  update((d) => (d.testimonials.items[i].role = e.target.value))
                }
                placeholder="Role"
                className="min-w-0 flex-1"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">
                Avatar (optional — falls back to initials)
              </span>
              <FileDropzone
                variant="avatar"
                value={item.avatar || null}
                onChange={(url) =>
                  update((d) => (d.testimonials.items[i].avatar = url ?? ""))
                }
              />
            </div>
          </div>
        )}
      />
    </Section>
  );
}
