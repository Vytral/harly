import { Images } from "lucide-react";

import { FileDropzone } from "@/components/ui/FileDropzone";

import type { SectionProps } from "../types";
import { Section, Field, ToggleRow, ListEditor, move } from "../primitives";

export function GallerySection({ config, update }: SectionProps) {
  return (
    <Section title="Photo gallery" icon={Images}>
      <ToggleRow
        label="Show gallery"
        checked={config.gallery.enabled}
        onCheckedChange={(v) => update((d) => (d.gallery.enabled = v))}
      />
      <ToggleRow
        label="Auto-scrolling carousel"
        checked={config.gallery.autoplay}
        onCheckedChange={(v) => update((d) => (d.gallery.autoplay = v))}
      />
      {config.gallery.autoplay && (
        <Field label="Carousel speed">
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            {(["slow", "normal"] as const).map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => update((d) => { d.gallery.speed = sp; })}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                  config.gallery.speed === sp
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {sp}
              </button>
            ))}
          </div>
        </Field>
      )}
      <ListEditor
        label="Images"
        items={config.gallery.images}
        onAdd={() => update((d) => d.gallery.images.push(""))}
        onRemove={(i) => update((d) => d.gallery.images.splice(i, 1))}
        onMove={(i, dir) => update((d) => move(d.gallery.images, i, dir))}
        render={(src, i) => (
          <FileDropzone
            value={src || null}
            onChange={(url) =>
              update((d) => (d.gallery.images[i] = url ?? ""))
            }
          />
        )}
      />
    </Section>
  );
}
