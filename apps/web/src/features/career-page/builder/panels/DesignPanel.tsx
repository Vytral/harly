"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  isLightColor,
  MODE_BG,
  type CareerPageConfig,
  type ColorMode,
  type FontFamily,
} from "@/features/career-page/config";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import type { ConfigUpdater } from "../types";
import { Field, ToggleRow, ColorField, ListEditor, move } from "../primitives";
import { PanelHeader, Section, Segmented } from "./PanelKit";

type DesignPanelProps = {
  config: CareerPageConfig;
  update: ConfigUpdater;
  workspace: WorkspaceBoardBranding & { id: string };
};

export function DesignPanel({ config, update, workspace }: DesignPanelProps) {
  return (
    <div className="space-y-6">
      <PanelHeader title="Design" subtitle="Theme, colors, gallery, and values." />

      {/* Theme */}
      <Section title="Theme" defaultOpen>
        <Field label="Mode">
          <Segmented
            value={config.theme.mode}
            onChange={(mode) =>
              update((d) => {
                d.theme.mode = mode as ColorMode;
                if (mode === "light" && !isLightColor(d.theme.background)) {
                  d.theme.background = MODE_BG.light;
                }
                if (mode === "dark" && isLightColor(d.theme.background)) {
                  d.theme.background = MODE_BG.dark;
                }
              })
            }
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Field>
        <ColorField
          label="Background color"
          value={config.theme.background}
          fallback="#ffffff"
          onChange={(c) => update((d) => (d.theme.background = c ?? "#ffffff"))}
        />
        <Field label="Font">
          <select
            value={config.theme.font}
            onChange={(e) =>
              update((d) => (d.theme.font = e.target.value as FontFamily))
            }
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors hover:border-pine/20 focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine/20"
          >
            <option value="sans">Sans-serif</option>
            <option value="serif">Serif</option>
            <option value="display">Display</option>
            <option value="mono">Monospace</option>
          </select>
        </Field>
        <ColorField
          label="Accent color"
          value={config.theme.accent}
          fallback={workspace.primaryColor}
          onChange={(c) => update((d) => (d.theme.accent = c))}
        />
      </Section>

      {/* Overview — Playful only */}
      {config.template === "playful" && (
        <Section title="Overview card">
          <ToggleRow
            label="Show overview card"
            checked={config.overview.enabled}
            onCheckedChange={(v) => update((d) => (d.overview.enabled = v))}
          />
          <Field label="Title">
            <Input
              value={config.overview.title}
              onChange={(e) => update((d) => (d.overview.title = e.target.value))}
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
              </div>
            )}
          />
        </Section>
      )}

      {/* Gallery — Playful only */}
      {config.template === "playful" && (
        <Section title="Photo gallery">
          <ToggleRow
            label="Show gallery"
            checked={config.gallery.enabled}
            onCheckedChange={(v) => update((d) => (d.gallery.enabled = v))}
          />
          <ToggleRow
            label="Autoplay"
            checked={config.gallery.autoplay}
            onCheckedChange={(v) => update((d) => (d.gallery.autoplay = v))}
          />
          {config.gallery.autoplay && (
            <Field label="Speed">
              <Segmented
                value={config.gallery.speed}
                onChange={(s) => update((d) => (d.gallery.speed = s))}
                options={[
                  { value: "slow", label: "Slow" },
                  { value: "normal", label: "Normal" },
                ]}
              />
            </Field>
          )}
          <ListEditor
            label="Images"
            items={config.gallery.images}
            onAdd={() => update((d) => d.gallery.images.push(""))}
            onRemove={(i) => update((d) => d.gallery.images.splice(i, 1))}
            onMove={(i, dir) => update((d) => move(d.gallery.images, i, dir))}
            render={(_src, i) => (
              <div className="text-xs text-ink-soft">Image {i + 1}</div>
            )}
          />
        </Section>
      )}

      {/* Values — Playful only */}
      {config.template === "playful" && (
        <Section title="Values">
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
            label="Items"
            items={config.values.items}
            onAdd={() =>
              update((d) => d.values.items.push({ title: "Value", body: "" }))
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
              </div>
            )}
          />
        </Section>
      )}

      {/* Testimonials */}
      <Section title="Testimonials">
        <ToggleRow
          label="Show testimonials"
          checked={config.testimonials.enabled}
          onCheckedChange={(v) => update((d) => (d.testimonials.enabled = v))}
        />
        <Field label="Title">
          <Input
            value={config.testimonials.title}
            onChange={(e) => update((d) => (d.testimonials.title = e.target.value))}
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
            </div>
          )}
        />
      </Section>

      {/* FAQ */}
      <Section title="FAQ">
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
          onAdd={() => update((d) => d.faq.items.push({ q: "Question", a: "" }))}
          onRemove={(i) => update((d) => d.faq.items.splice(i, 1))}
          onMove={(i, dir) => update((d) => move(d.faq.items, i, dir))}
          render={(item, i) => (
            <div className="space-y-2">
              <Input
                value={item.q}
                onChange={(e) => update((d) => (d.faq.items[i].q = e.target.value))}
                placeholder="Question"
              />
              <Textarea
                rows={3}
                value={item.a}
                onChange={(e) => update((d) => (d.faq.items[i].a = e.target.value))}
                placeholder="Answer"
              />
            </div>
          )}
        />
      </Section>
    </div>
  );
}
