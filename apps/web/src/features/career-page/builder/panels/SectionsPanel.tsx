"use client";

import { useTranslations } from "next-intl";

import { MAX_PROCESS_STEPS } from "@/features/career-page/config";

import type { SectionProps } from "../types";
import { capabilitiesFor, templateLabel, type TemplateCapabilities } from "../template-capabilities";
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

const ORDER: SectionId[] = ["overview", "values", "gallery", "testimonials", "process", "faq", "cta"];

/** Content blocks below the hero. Blocks the template ignores sink to the end. */
export function SectionsPanel(props: SectionProps) {
  const t = useTranslations("features.careerPage.SectionsPanel");
  const tTemplates = useTranslations("labels.careerPage.templates");
  const caps = capabilitiesFor(props.config.template);
  const supported = ORDER.filter((id) => caps[id]);
  const unsupported = ORDER.filter((id) => !caps[id]);

  return (
    <div className="space-y-4">
      <PanelHeader title={t("title")} subtitle={t("subtitle")} />
      {supported.map((id) => (
        <SectionEditor key={id} id={id} caps={caps} {...props} />
      ))}
      {unsupported.length > 0 ? (
        <div className="space-y-2 pt-2">
          {unsupported.map((id) => (
            <Group key={id} title={t(`sectionLabels.${id}`)} unsupported={templateLabel(props.config.template, tTemplates)} />
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
  const t = useTranslations("features.careerPage.SectionsPanel");
  switch (id) {
    case "overview":
      return (
        <Group
          title={t("sectionLabels.overview")}
          description={t("overviewDescription")}
          enabled={config.overview.enabled}
          onEnabledChange={(v) => update((d) => void (d.overview.enabled = v))}
          badge={count(t, config.overview.stats.length)}
          errorPrefix="overview."
        >
          <TextField
            label={t("title")}
            path="overview.title"
            value={config.overview.title}
            max={60}
            onChange={(v) => update((d) => void (d.overview.title = v))}
          />
          <ListEditor
            label={t("facts")}
            itemName={t("fact")}
            items={config.overview.stats}
            max={8}
            emptyText={t("factsEmpty")}
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
                    label={t("label")}
                    path={`overview.stats.${i}.label`}
                    value={stat.label}
                    max={40}
                    placeholder={t("founded")}
                    onChange={(v) => update((d) => void (d.overview.stats[i].label = v))}
                  />
                  <TextField
                    label={t("value")}
                    path={`overview.stats.${i}.value`}
                    value={stat.value}
                    max={60}
                    placeholder={t("year")}
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
          title={t("sectionLabels.values")}
          description={t("valuesDescription")}
          enabled={config.values.enabled}
          onEnabledChange={(v) => update((d) => void (d.values.enabled = v))}
          badge={count(t, config.values.items.length)}
          errorPrefix="values."
        >
          <TextField
            label={t("title")}
            path="values.title"
            value={config.values.title}
            max={60}
            onChange={(v) => update((d) => void (d.values.title = v))}
          />
          <ListEditor
            label={t("items")}
            itemName={t("valueItem")}
            items={config.values.items}
            max={8}
            emptyText={t("valuesEmpty")}
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
                      label={t("title")}
                      path={`values.items.${i}.title`}
                      value={value.title}
                      max={60}
                      onChange={(v) => update((d) => void (d.values.items[i].title = v))}
                    />
                  </div>
                </div>
                <TextField
                  label={t("description")}
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
          title={t("sectionLabels.gallery")}
          description={t("galleryDescription")}
          enabled={config.gallery.enabled}
          onEnabledChange={(v) => update((d) => void (d.gallery.enabled = v))}
          badge={count(t, config.gallery.images.length, "photo")}
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
                label={t("scrollPhotos")}
                checked={config.gallery.autoplay}
                onCheckedChange={(v) => update((d) => void (d.gallery.autoplay = v))}
              />
              {config.gallery.autoplay ? (
                <Segmented
                  label={t("speed")}
                  value={config.gallery.speed}
                  onChange={(s) => update((d) => void (d.gallery.speed = s))}
                  options={[
                    { value: "slow", label: t("speedSlow") },
                    { value: "normal", label: t("speedNormal") },
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
          title={t("sectionLabels.testimonials")}
          description={t("testimonialsDescription")}
          enabled={config.testimonials.enabled}
          onEnabledChange={(v) => update((d) => void (d.testimonials.enabled = v))}
          badge={count(t, config.testimonials.items.length)}
          errorPrefix="testimonials."
        >
          <TextField
            label={t("title")}
            path="testimonials.title"
            value={config.testimonials.title}
            max={60}
            onChange={(v) => update((d) => void (d.testimonials.title = v))}
          />
          <ListEditor
            label={t("quotes")}
            itemName={t("quote")}
            items={config.testimonials.items}
            max={12}
            emptyText={t("quotesEmpty")}
            onAdd={() =>
              update((d) => void d.testimonials.items.push({ quote: "", name: "", role: "", avatar: "" }))
            }
            onRemove={(i) => update((d) => void d.testimonials.items.splice(i, 1))}
            onRestore={(i, item) => update((d) => void d.testimonials.items.splice(i, 0, item))}
            onMove={(i, dir) => update((d) => move(d.testimonials.items, i, dir))}
            render={(item, i) => (
              <div className="space-y-2">
                <TextField
                  label={t("quote")}
                  path={`testimonials.items.${i}.quote`}
                  value={item.quote}
                  max={600}
                  rows={3}
                  onChange={(v) => update((d) => void (d.testimonials.items[i].quote = v))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <TextField
                    label={t("name")}
                    path={`testimonials.items.${i}.name`}
                    value={item.name}
                    max={60}
                    onChange={(v) => update((d) => void (d.testimonials.items[i].name = v))}
                  />
                  <TextField
                    label={t("role")}
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
          title={t("sectionLabels.process")}
          description={t("processDescription")}
          enabled={process.enabled}
          onEnabledChange={(v) => update((d) => void (ensure(d).enabled = v))}
          badge={count(t, process.steps.length, "step")}
          errorPrefix="process."
        >
          <TextField
            label={t("title")}
            path="process.title"
            value={process.title}
            max={60}
            onChange={(v) => update((d) => void (ensure(d).title = v))}
          />
          <ListEditor
            label={t("steps")}
            itemName={t("step")}
            items={process.steps}
            max={MAX_PROCESS_STEPS}
            emptyText={t("stepsEmpty")}
            onAdd={() => update((d) => void ensure(d).steps.push({ title: "", body: "" }))}
            onRemove={(i) => update((d) => void ensure(d).steps.splice(i, 1))}
            onRestore={(i, item) => update((d) => void ensure(d).steps.splice(i, 0, item))}
            onMove={(i, dir) => update((d) => move(ensure(d).steps, i, dir))}
            render={(step, i) => (
              <div className="space-y-2">
                <TextField
                  label={t("stepNumber", { number: i + 1 })}
                  path={`process.steps.${i}.title`}
                  value={step.title}
                  max={80}
                  placeholder={t("stepPlaceholder")}
                  onChange={(v) => update((d) => void (ensure(d).steps[i].title = v))}
                />
                <TextField
                  label={t("details")}
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
          title={t("sectionLabels.faq")}
          description={t("faqDescription")}
          enabled={config.faq.enabled}
          onEnabledChange={(v) => update((d) => void (d.faq.enabled = v))}
          badge={count(t, config.faq.items.length)}
          errorPrefix="faq."
        >
          <TextField
            label={t("title")}
            path="faq.title"
            value={config.faq.title}
            max={60}
            onChange={(v) => update((d) => void (d.faq.title = v))}
          />
          <ListEditor
            label={t("questions")}
            itemName={t("question")}
            items={config.faq.items}
            max={20}
            emptyText={t("questionsEmpty")}
            onAdd={() => update((d) => void d.faq.items.push({ q: "", a: "" }))}
            onRemove={(i) => update((d) => void d.faq.items.splice(i, 1))}
            onRestore={(i, item) => update((d) => void d.faq.items.splice(i, 0, item))}
            onMove={(i, dir) => update((d) => move(d.faq.items, i, dir))}
            render={(item, i) => (
              <div className="space-y-2">
                <TextField
                  label={t("question")}
                  path={`faq.items.${i}.q`}
                  value={item.q}
                  max={200}
                  onChange={(v) => update((d) => void (d.faq.items[i].q = v))}
                />
                <TextField
                  label={t("answer")}
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
          title={t("sectionLabels.cta")}
          description={t("ctaDescription")}
          enabled={config.cta.enabled}
          onEnabledChange={(v) => update((d) => void (d.cta.enabled = v))}
          errorPrefix="cta."
        >
          <TextField
            label={t("heading")}
            path="cta.title"
            value={config.cta.title}
            max={120}
            placeholder={t("headingPlaceholder")}
            hint={config.cta.enabled && !config.cta.title.trim() ? t("headingHint") : undefined}
            onChange={(v) => update((d) => void (d.cta.title = v))}
          />
          <TextField
            label={t("body")}
            path="cta.body"
            value={config.cta.body}
            max={400}
            rows={2}
            placeholder={t("bodyPlaceholder")}
            onChange={(v) => update((d) => void (d.cta.body = v))}
          />
          {caps.ctaButton ? (
            <TextField
              label={t("buttonLabel")}
              path="cta.buttonText"
              value={config.cta.buttonText}
              max={60}
              placeholder={t("buttonPlaceholder")}
              onChange={(v) => update((d) => void (d.cta.buttonText = v))}
            />
          ) : null}
          {caps.ctaUrl ? (
            <TextField
              label={t("buttonLink")}
              path="cta.url"
              type="url"
              value={config.cta.url ?? ""}
              max={600}
              placeholder={workspace.websiteUrl || "https://…"}
              hint={t("buttonLinkHint")}
              onChange={(v) => update((d) => void (d.cta.url = v))}
            />
          ) : (
            <p className="text-[12px] leading-snug text-soft-ink">
              {needsWebsite
                ? t("ctaWebsiteMissing")
                : workspace.websiteUrl
                  ? t("ctaWebsiteWithUrl", { url: workspace.websiteUrl })
                  : t("ctaWebsite")}
            </p>
          )}
          <ColorField
            label={t("colour")}
            path="cta.color"
            value={config.cta.color}
            fallback={fallbackColor}
            hint={config.cta.color ? undefined : t("colourHint")}
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

function count(
  t: ReturnType<typeof useTranslations>,
  n: number,
  noun: "item" | "photo" | "step" = "item",
) {
  if (n === 0) return t("empty");
  if (noun === "photo") return t("countPhotos", { count: n });
  if (noun === "step") return t("countSteps", { count: n });
  return t("countItems", { count: n });
}
