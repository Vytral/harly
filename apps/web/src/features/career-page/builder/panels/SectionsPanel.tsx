"use client";

import { MAX_PROCESS_STEPS } from "@/features/career-page/config";

import type { SectionProps } from "../types";
import { capabilitiesFor, type TemplateCapabilities } from "../template-capabilities";
import { ContrastNotice } from "../ContrastNotice";
import {
  AvatarField,
  ColorField,
  IconSelect,
  ImageListEditor,
  ListEditor,
  TextField,
  ToggleRow,
  move,
} from "../primitives";
import { Group, PanelHeader, Segmented } from "./PanelKit";

type SectionId = "overview" | "values" | "gallery" | "testimonials" | "process" | "faq" | "cta";

const SECTION_LABEL: Record<SectionId, string> = {
  overview: "Key facts",
  values: "Values & benefits",
  gallery: "Photo gallery",
  testimonials: "Testimonials",
  process: "How we hire",
  faq: "FAQ",
  cta: "Call to action",
};

const ORDER: SectionId[] = ["overview", "values", "gallery", "testimonials", "process", "faq", "cta"];

/** Content blocks below the hero. Blocks the template ignores sink to the end. */
export function SectionsPanel(props: SectionProps) {
  const caps = capabilitiesFor(props.config.template);
  const supported = ORDER.filter((id) => caps[id]);
  const unsupported = ORDER.filter((id) => !caps[id]);

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Sections"
        subtitle="Blocks below the hero. Each one stays hidden until it's on and has content."
      />
      {supported.map((id) => (
        <SectionEditor key={id} id={id} caps={caps} {...props} />
      ))}
      {unsupported.length > 0 ? (
        <div className="space-y-2 pt-2">
          {unsupported.map((id) => (
            <Group key={id} title={SECTION_LABEL[id]} unsupported={caps.label} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SectionEditor({
  id,
  caps,
  config,
  update,
  workspace,
}: SectionProps & { id: SectionId; caps: TemplateCapabilities }) {
  switch (id) {
    case "overview":
      return (
        <Group
          title={SECTION_LABEL.overview}
          description="Founded, team size, locations…"
          enabled={config.overview.enabled}
          onEnabledChange={(v) => update((d) => void (d.overview.enabled = v))}
          badge={count(config.overview.stats.length)}
          errorPrefix="overview."
        >
          <TextField
            label="Title"
            path="overview.title"
            value={config.overview.title}
            max={60}
            onChange={(v) => update((d) => void (d.overview.title = v))}
          />
          <ListEditor
            label="Facts"
            itemName="Fact"
            items={config.overview.stats}
            max={8}
            emptyText="Add a fact like Founded · 2019."
            onAdd={() => update((d) => void d.overview.stats.push({ label: "", value: "", icon: "" }))}
            onRemove={(i) => update((d) => void d.overview.stats.splice(i, 1))}
            onRestore={(i, item) => update((d) => void d.overview.stats.splice(i, 0, item))}
            onMove={(i, dir) => update((d) => move(d.overview.stats, i, dir))}
            render={(stat, i) => (
              <div className="flex items-start gap-2">
                <IconSelect
                  value={stat.icon ?? ""}
                  onChange={(v) => update((d) => void (d.overview.stats[i].icon = v))}
                />
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                  <TextField
                    label="Label"
                    path={`overview.stats.${i}.label`}
                    value={stat.label}
                    max={40}
                    placeholder="Founded"
                    onChange={(v) => update((d) => void (d.overview.stats[i].label = v))}
                  />
                  <TextField
                    label="Value"
                    path={`overview.stats.${i}.value`}
                    value={stat.value}
                    max={60}
                    placeholder="2019"
                    onChange={(v) => update((d) => void (d.overview.stats[i].value = v))}
                  />
                </div>
              </div>
            )}
          />
        </Group>
      );

    case "values":
      return (
        <Group
          title={SECTION_LABEL.values}
          description="What you stand for, or what you offer"
          enabled={config.values.enabled}
          onEnabledChange={(v) => update((d) => void (d.values.enabled = v))}
          badge={count(config.values.items.length)}
          errorPrefix="values."
        >
          <TextField
            label="Title"
            path="values.title"
            value={config.values.title}
            max={60}
            onChange={(v) => update((d) => void (d.values.title = v))}
          />
          <ListEditor
            label="Items"
            itemName="Value"
            items={config.values.items}
            max={8}
            emptyText="Add a value or a benefit, e.g. Remote-first."
            onAdd={() => update((d) => void d.values.items.push({ title: "", body: "" }))}
            onRemove={(i) => update((d) => void d.values.items.splice(i, 1))}
            onRestore={(i, item) => update((d) => void d.values.items.splice(i, 0, item))}
            onMove={(i, dir) => update((d) => move(d.values.items, i, dir))}
            render={(value, i) => (
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  {caps.valueIcons ? (
                    <IconSelect
                      value={value.art ?? ""}
                      onChange={(v) => update((d) => void (d.values.items[i].art = v))}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <TextField
                      label="Title"
                      path={`values.items.${i}.title`}
                      value={value.title}
                      max={60}
                      onChange={(v) => update((d) => void (d.values.items[i].title = v))}
                    />
                  </div>
                </div>
                <TextField
                  label="Description"
                  path={`values.items.${i}.body`}
                  value={value.body}
                  max={400}
                  rows={2}
                  onChange={(v) => update((d) => void (d.values.items[i].body = v))}
                />
              </div>
            )}
          />
        </Group>
      );

    case "gallery":
      return (
        <Group
          title={SECTION_LABEL.gallery}
          description="Team and office photos"
          enabled={config.gallery.enabled}
          onEnabledChange={(v) => update((d) => void (d.gallery.enabled = v))}
          badge={count(config.gallery.images.length, "photo")}
          errorPrefix="gallery."
        >
          <ImageListEditor
            images={config.gallery.images}
            max={12}
            onChange={(images) => update((d) => void (d.gallery.images = images))}
          />
          {caps.galleryAutoplay ? (
            <>
              <ToggleRow
                label="Scroll photos automatically"
                checked={config.gallery.autoplay}
                onCheckedChange={(v) => update((d) => void (d.gallery.autoplay = v))}
              />
              {config.gallery.autoplay ? (
                <Segmented
                  label="Speed"
                  value={config.gallery.speed}
                  onChange={(s) => update((d) => void (d.gallery.speed = s))}
                  options={[
                    { value: "slow", label: "Slow" },
                    { value: "normal", label: "Normal" },
                  ]}
                />
              ) : null}
            </>
          ) : null}
        </Group>
      );

    case "testimonials":
      return (
        <Group
          title={SECTION_LABEL.testimonials}
          description="Quotes from people on the team"
          enabled={config.testimonials.enabled}
          onEnabledChange={(v) => update((d) => void (d.testimonials.enabled = v))}
          badge={count(config.testimonials.items.length)}
          errorPrefix="testimonials."
        >
          <TextField
            label="Title"
            path="testimonials.title"
            value={config.testimonials.title}
            max={60}
            onChange={(v) => update((d) => void (d.testimonials.title = v))}
          />
          <ListEditor
            label="Quotes"
            itemName="Quote"
            items={config.testimonials.items}
            max={12}
            emptyText="Add a quote from someone on the team."
            onAdd={() =>
              update((d) => void d.testimonials.items.push({ quote: "", name: "", role: "", avatar: "" }))
            }
            onRemove={(i) => update((d) => void d.testimonials.items.splice(i, 1))}
            onRestore={(i, item) => update((d) => void d.testimonials.items.splice(i, 0, item))}
            onMove={(i, dir) => update((d) => move(d.testimonials.items, i, dir))}
            render={(item, i) => (
              <div className="space-y-2">
                <TextField
                  label="Quote"
                  path={`testimonials.items.${i}.quote`}
                  value={item.quote}
                  max={600}
                  rows={3}
                  onChange={(v) => update((d) => void (d.testimonials.items[i].quote = v))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <TextField
                    label="Name"
                    path={`testimonials.items.${i}.name`}
                    value={item.name}
                    max={60}
                    onChange={(v) => update((d) => void (d.testimonials.items[i].name = v))}
                  />
                  <TextField
                    label="Role"
                    path={`testimonials.items.${i}.role`}
                    value={item.role}
                    max={60}
                    onChange={(v) => update((d) => void (d.testimonials.items[i].role = v))}
                  />
                </div>
                <AvatarField
                  value={item.avatar}
                  onChange={(url) => update((d) => void (d.testimonials.items[i].avatar = url))}
                />
              </div>
            )}
          />
        </Group>
      );

    case "process": {
      const process = config.process ?? { enabled: false, title: "How we hire", steps: [] };
      const ensure = (d: typeof config) => {
        d.process ??= { enabled: false, title: "How we hire", steps: [] };
        return d.process;
      };
      return (
        <Group
          title={SECTION_LABEL.process}
          description="Your interview steps, in order"
          enabled={process.enabled}
          onEnabledChange={(v) => update((d) => void (ensure(d).enabled = v))}
          badge={count(process.steps.length, "step")}
          errorPrefix="process."
        >
          <TextField
            label="Title"
            path="process.title"
            value={process.title}
            max={60}
            onChange={(v) => update((d) => void (ensure(d).title = v))}
          />
          <ListEditor
            label="Steps"
            itemName="Step"
            items={process.steps}
            max={MAX_PROCESS_STEPS}
            emptyText="Add a step, e.g. Intro call · 30 minutes with the hiring manager."
            onAdd={() => update((d) => void ensure(d).steps.push({ title: "", body: "" }))}
            onRemove={(i) => update((d) => void ensure(d).steps.splice(i, 1))}
            onRestore={(i, item) => update((d) => void ensure(d).steps.splice(i, 0, item))}
            onMove={(i, dir) => update((d) => move(ensure(d).steps, i, dir))}
            render={(step, i) => (
              <div className="space-y-2">
                <TextField
                  label={`Step ${i + 1}`}
                  path={`process.steps.${i}.title`}
                  value={step.title}
                  max={80}
                  placeholder="Intro call"
                  onChange={(v) => update((d) => void (ensure(d).steps[i].title = v))}
                />
                <TextField
                  label="Details"
                  path={`process.steps.${i}.body`}
                  value={step.body ?? ""}
                  max={400}
                  rows={2}
                  onChange={(v) => update((d) => void (ensure(d).steps[i].body = v))}
                />
              </div>
            )}
          />
        </Group>
      );
    }

    case "faq":
      return (
        <Group
          title={SECTION_LABEL.faq}
          description="Answers to what candidates ask most"
          enabled={config.faq.enabled}
          onEnabledChange={(v) => update((d) => void (d.faq.enabled = v))}
          badge={count(config.faq.items.length)}
          errorPrefix="faq."
        >
          <TextField
            label="Title"
            path="faq.title"
            value={config.faq.title}
            max={60}
            onChange={(v) => update((d) => void (d.faq.title = v))}
          />
          <ListEditor
            label="Questions"
            itemName="Question"
            items={config.faq.items}
            max={20}
            emptyText="Add a question, e.g. Do you sponsor visas?"
            onAdd={() => update((d) => void d.faq.items.push({ q: "", a: "" }))}
            onRemove={(i) => update((d) => void d.faq.items.splice(i, 1))}
            onRestore={(i, item) => update((d) => void d.faq.items.splice(i, 0, item))}
            onMove={(i, dir) => update((d) => move(d.faq.items, i, dir))}
            render={(item, i) => (
              <div className="space-y-2">
                <TextField
                  label="Question"
                  path={`faq.items.${i}.q`}
                  value={item.q}
                  max={200}
                  onChange={(v) => update((d) => void (d.faq.items[i].q = v))}
                />
                <TextField
                  label="Answer"
                  path={`faq.items.${i}.a`}
                  value={item.a}
                  max={2000}
                  rows={3}
                  onChange={(v) => update((d) => void (d.faq.items[i].a = v))}
                />
              </div>
            )}
          />
        </Group>
      );

    case "cta": {
      const fallbackColor = config.theme.accent ?? workspace.primaryColor;
      const needsWebsite = !caps.ctaUrl && !workspace.websiteUrl;
      return (
        <Group
          title={SECTION_LABEL.cta}
          description="A closing band, e.g. “Don't see your role?”"
          enabled={config.cta.enabled}
          onEnabledChange={(v) => update((d) => void (d.cta.enabled = v))}
          errorPrefix="cta."
        >
          <TextField
            label="Heading"
            path="cta.title"
            value={config.cta.title}
            max={120}
            placeholder="Don't see a role that fits?"
            hint={config.cta.enabled && !config.cta.title.trim() ? "Add a heading, or the band stays hidden." : undefined}
            onChange={(v) => update((d) => void (d.cta.title = v))}
          />
          <TextField
            label="Body"
            path="cta.body"
            value={config.cta.body}
            max={400}
            rows={2}
            placeholder="We're always glad to meet great people."
            onChange={(v) => update((d) => void (d.cta.body = v))}
          />
          {caps.ctaButton ? (
            <TextField
              label="Button label"
              path="cta.buttonText"
              value={config.cta.buttonText}
              max={60}
              placeholder="Get in touch"
              onChange={(v) => update((d) => void (d.cta.buttonText = v))}
            />
          ) : null}
          {caps.ctaUrl ? (
            <TextField
              label="Button link"
              path="cta.url"
              type="url"
              value={config.cta.url ?? ""}
              max={600}
              placeholder={workspace.websiteUrl || "https://…"}
              hint="Empty links to your website, or the candidate portal if no website is set."
              onChange={(v) => update((d) => void (d.cta.url = v))}
            />
          ) : (
            <p className="text-[12px] leading-snug text-soft-ink">
              {needsWebsite
                ? "The button links to your company website, which isn't set yet. Add it in Settings → Branding, or the button is hidden."
                : `The button links to your company website${workspace.websiteUrl ? ` (${workspace.websiteUrl})` : ""}.`}
            </p>
          )}
          <ColorField
            label="Colour"
            path="cta.color"
            value={config.cta.color}
            fallback={fallbackColor}
            hint={config.cta.color ? undefined : "Empty uses your accent colour."}
            onChange={(c) => update((d) => void (d.cta.color = c))}
          >
            {config.cta.color ? (
              <ContrastNotice
                config={config}
                color={config.cta.color}
                checkBackground={false}
                onFix={(c) => update((d) => void (d.cta.color = c))}
              />
            ) : null}
          </ColorField>
        </Group>
      );
    }
  }
}

function count(n: number, noun = "item") {
  if (n === 0) return "Empty";
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
