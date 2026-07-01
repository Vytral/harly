"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Ban,
  BarChart3,
  Briefcase,
  Check,
  ChevronDown,
  Eye,
  HelpCircle,
  Image as ImageIcon,
  Images,
  Layout,
  Loader2,
  Megaphone,
  Monitor,
  Palette,
  Plus,
  Quote,
  Search,
  Share2,
  Smartphone,
  Sparkles,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { FileDropzone } from "@/components/ui/FileDropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import { cn } from "@/lib/utils";

import { saveCareerPageConfigAction } from "@/features/career-page/actions";
import {
  CAREER_PRESETS,
  careerTemplates,
  isLightColor,
  MODE_BG,
  socialPlatforms,
  type CareerPageConfig,
  type CareerTemplate,
  type SocialPlatform,
} from "@/features/career-page/config";
import { CareerPageRender } from "@/features/career-page/CareerPageRender";
import {
  CAREER_ICONS,
  CAREER_ICON_NAMES,
  CareerIcon,
  careerIcon,
} from "@/features/career-page/icons";
import { SocialIcon, SOCIAL_ICONS } from "@/features/career-page/social-icons";
import type { Job } from "@/features/career-page/types";


const LEGAL_SLUG_LABELS: Record<string, string> = {
  "privacy-policy": "Privacy Policy",
  "terms-of-service": "Terms of Service",
  "cookie-policy": "Cookie Policy",
  "candidate-notice": "Candidate Notice",
  "ai-transparency-notice": "AI Transparency",
};

const TEMPLATE_META: Record<
  CareerTemplate,
  { label: string; blurb: string; ready: boolean }
> = {
  minimal: { label: "Minimal", blurb: "Clean type, just the essentials", ready: true },
  playful: { label: "Playful", blurb: "Colorful, friendly, high-energy", ready: true },
  ashby: { label: "Ashby", blurb: "Structured, sidebar filters", ready: true },
};

export function CareerPageBuilder({
  initialConfig,
  workspace,
  jobs,
  availableLegalPages = [],
}: {
  initialConfig: CareerPageConfig;
  workspace: WorkspaceBoardBranding & { id: string };
  jobs: Job[];
  /** Legal page slugs configured in workspace settings (e.g. ["privacy-policy"]). */
  availableLegalPages?: string[];
}) {
  const [config, setConfig] = useState<CareerPageConfig>(initialConfig);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, startSave] = useTransition();
  const [dirty, setDirty] = useState(false);

  function update(producer: (draft: CareerPageConfig) => void) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      producer(next);
      return next;
    });
    setDirty(true);
  }

  function chooseTemplate(t: CareerTemplate) {
    // Unconfigured → load the preset; already-configured → just swap layout,
    // keeping the user's content.
    if (config.template === "") {
      setConfig(CAREER_PRESETS[t]());
    } else {
      update((d) => {
        d.template = t;
      });
    }
    setDirty(true);
  }

  function save() {
    if (!dirty || saving) return;
    startSave(async () => {
      const result = await saveCareerPageConfigAction(config);
      if (result.success) {
        toast.success("Career page saved — it's live.");
        setDirty(false);
      } else {
        toast.error(result.error ?? "Could not save.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Career page
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Design your public careers site. Changes preview live; save to publish.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/board/${workspace.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Eye className="size-4" /> View live
          </a>
          <Button
            onClick={save}
            disabled={!!(saving || !dirty)}
            aria-label={
              saving
                ? "Saving changes"
                : dirty
                  ? "Save changes"
                  : "All changes saved"
            }
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : dirty ? null : (
              <Check className="size-4" />
            )}
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[480px_minmax(0,1fr)]">
        {/* Editor */}
        <div className="rounded-2xl border bg-card">
          <div className="border-b p-4">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Template
            </Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {careerTemplates.map((t) => {
                const meta = TEMPLATE_META[t];
                const active = config.template === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => chooseTemplate(t)}
                    disabled={!meta.ready}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none",
                      active
                        ? "border-pine bg-sage/40 ring-2 ring-pine/20"
                        : meta.ready
                          ? "hover:border-border hover:bg-muted/60"
                          : "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="block text-sm font-medium">{meta.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {meta.blurb}
                    </span>
                    {!meta.ready && (
                      <span className="mt-1.5 inline-block rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                        Coming soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {config.template !== "" && (
              <button
                type="button"
                onClick={() => {
                  if (!confirm("Reset all settings to template defaults? This cannot be undone.")) return;
                  setConfig(CAREER_PRESETS[config.template as CareerTemplate]());
                  setDirty(true);
                }}
                className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Reset to template defaults
              </button>
            )}
          </div>

          {config.template === "" ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Pick a template above to start designing.
            </div>
          ) : (
            <div className="px-4">
              {/* Hero */}
              <Section title="Hero" icon={Layout} defaultOpen>
                <Field label="Headline">
                  <Input
                    value={config.hero.headline}
                    onChange={(e) => update((d) => (d.hero.headline = e.target.value))}
                    placeholder="Join us"
                  />
                </Field>
                <Field label="Subhead">
                  <Input
                    value={config.hero.subhead}
                    onChange={(e) => update((d) => (d.hero.subhead = e.target.value))}
                    placeholder="A short tagline or mission statement"
                  />
                </Field>

                {/* Minimal-specific hero options */}
                {config.template === "minimal" && (
                  <>
                    <ToggleRow
                      label="Use banner image instead of topbar"
                      checked={config.hero.bannerEnabled}
                      onCheckedChange={(v) => update((d) => (d.hero.bannerEnabled = v))}
                    />
                    {config.hero.bannerEnabled && (
                      <>
                        <Field label="Banner image">
                          <FileDropzone
                            aspect="banner"
                            value={config.hero.imageUrl ?? workspace.heroImageUrl}
                            onChange={(url) => update((d) => (d.hero.imageUrl = url))}
                          />
                        </Field>
                        <Field label={`Overlay opacity — ${config.hero.overlayOpacity}%`}>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={config.hero.overlayOpacity}
                            onChange={(e) =>
                              update((d) => (d.hero.overlayOpacity = Number(e.target.value)))
                            }
                            className="w-full accent-pine"
                          />
                        </Field>
                        <ToggleRow
                          label="Show headline text"
                          checked={config.hero.showHeadline}
                          onCheckedChange={(v) => update((d) => (d.hero.showHeadline = v))}
                        />
                      </>
                    )}
                    <Field label="Logo to display">
                      <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                        {(["logo", "fullLogo"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => update((d) => (d.hero.logoType = t))}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                              config.hero.logoType === t
                                ? "bg-card text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {t === "logo" ? "Square mark" : "Full wordmark"}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Button text">
                      <Input
                        value={config.hero.ctaButtonText}
                        onChange={(e) => update((d) => (d.hero.ctaButtonText = e.target.value))}
                        placeholder="View jobs"
                      />
                    </Field>
                  </>
                )}

                {/* Banner image + overlay — Playful & Ashby */}
                {config.template !== "minimal" && (
                  <>
                    <Field label="Banner image">
                      <FileDropzone
                        aspect="banner"
                        value={config.hero.imageUrl}
                        onChange={(url) => update((d) => (d.hero.imageUrl = url))}
                      />
                    </Field>
                    <ToggleRow
                      label="Gradient overlay (left → right)"
                      checked={config.hero.overlay === "gradient"}
                      onCheckedChange={(v) =>
                        update((d) => (d.hero.overlay = v ? "gradient" : "none"))
                      }
                    />
                    {config.hero.overlay === "gradient" && (
                      <div className="grid grid-cols-2 gap-2">
                        <ColorField
                          label="From"
                          value={config.hero.overlayFrom}
                          fallback={config.theme.accent ?? workspace.primaryColor}
                          onChange={(c) => update((d) => (d.hero.overlayFrom = c))}
                        />
                        <ColorField
                          label="To"
                          value={config.hero.overlayTo}
                          fallback="#ffffff"
                          onChange={(c) => update((d) => (d.hero.overlayTo = c))}
                        />
                      </div>
                    )}
                  </>
                )}

                <Field label="Logo position">
                  <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                    {(["left", "center", "right"] as const).map((pos) => {
                      const Icon = pos === "left" ? AlignLeft : pos === "center" ? AlignCenter : AlignRight;
                      return (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => update((d) => { d.hero.logoPosition = pos; })}
                          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            config.hero.logoPosition === pos
                              ? "bg-card text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Icon className="size-3.5" strokeWidth={1.8} />
                          {pos.charAt(0).toUpperCase() + pos.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <ToggleRow
                  label="Show company name next to logo"
                  checked={config.hero.showName}
                  onCheckedChange={(v) => update((d) => { d.hero.showName = v; })}
                />
              </Section>

              {/* Intro */}
              <Section title="Intro & content" icon={Type}>
                <Field label="Intro / about us">
                  <RichTextEditor
                    key={config.template}
                    defaultValue={config.intro.body}
                    placeholder="Tell candidates about your company, culture, mission…"
                    minHeight="10rem"
                    onChange={(html) => update((d) => (d.intro.body = html))}
                  />
                </Field>
                {config.template === "playful" && (
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
                )}
              </Section>

              {/* Overview — Playful only */}
              {config.template === "playful" && (
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
              )}

              {/* Gallery — Playful only */}
              {config.template === "playful" && (
              <Section title="Photo gallery" icon={Images}>
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
                    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                      {(["slow", "normal"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => update((d) => { d.gallery.speed = s; })}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                            config.gallery.speed === s
                              ? "bg-card text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {s}
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
              )}

              {/* Values — Playful only */}
              {config.template === "playful" && (
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

              {/* Positions */}
              <Section title="Open positions" icon={Briefcase}>
                <Field label="Section title">
                  <Input
                    value={config.positions.title}
                    onChange={(e) =>
                      update((d) => (d.positions.title = e.target.value))
                    }
                  />
                </Field>
                <Field label="Filters">
                  <div className="flex flex-wrap gap-2">
                    {(["department", "location", "type"] as const).map((f) => {
                      const on = config.positions.filters.includes(f);
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() =>
                            update((d) => {
                              d.positions.filters = on
                                ? d.positions.filters.filter((x) => x !== f)
                                : [...d.positions.filters, f];
                            })
                          }
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs capitalize transition-colors",
                            on
                              ? "border-pine bg-sage/40 text-sage-ink"
                              : "text-muted-foreground",
                          )}
                        >
                          {f}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </Section>

              {/* CTA */}
              <Section title="Call to action" icon={Megaphone}>
                <ToggleRow
                  label="Show CTA banner"
                  checked={config.cta.enabled}
                  onCheckedChange={(v) => update((d) => (d.cta.enabled = v))}
                />
                <Field label="Title">
                  <Input
                    value={config.cta.title}
                    onChange={(e) => update((d) => (d.cta.title = e.target.value))}
                  />
                </Field>
                <Field label="Body">
                  <Textarea
                    rows={2}
                    value={config.cta.body}
                    onChange={(e) => update((d) => (d.cta.body = e.target.value))}
                  />
                </Field>
                <Field label="Button text">
                  <Input
                    value={config.cta.buttonText}
                    onChange={(e) => update((d) => (d.cta.buttonText = e.target.value))}
                    placeholder="Get in touch"
                  />
                </Field>
                {/* Banner color — Playful only (Minimal CTA is text-only, Ashby has no CTA) */}
                {config.template === "playful" && (
                  <ColorField
                    label="Banner color"
                    value={config.cta.color}
                    fallback={config.theme.accent ?? workspace.primaryColor}
                    onChange={(c) => update((d) => (d.cta.color = c))}
                  />
                )}
              </Section>

              {/* Testimonials */}
              <Section title="Testimonials" icon={Quote}>
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
                      <div className="space-y-1">
                        <span className="text-[11px] text-muted-foreground">
                          Avatar (optional — falls back to initials)
                        </span>
                        <FileDropzone
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

              {/* FAQ */}
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

              {/* Footer socials */}
              <Section title="Footer & socials" icon={Share2}>
                <p className="text-[11px] text-muted-foreground">
                  Shown bottom-right with real brand icons.
                </p>
                {availableLegalPages.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] font-medium text-foreground">Legal links</p>
                    <p className="text-[11px] text-muted-foreground">Select which legal pages appear in the footer.</p>
                    {availableLegalPages.map((slug) => {
                      const label = LEGAL_SLUG_LABELS[slug] ?? slug;
                      const checked = (config.footer.legalLinks ?? []).includes(slug);
                      return (
                        <label key={slug} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              update((d) => {
                                const links = d.footer.legalLinks ?? [];
                                if (links.includes(slug)) {
                                  d.footer.legalLinks = links.filter((l) => l !== slug);
                                } else {
                                  d.footer.legalLinks = [...links, slug];
                                }
                              })
                            }
                            className="size-3.5 rounded border-zinc-300 accent-pine"
                          />
                          <span className="text-[12px] text-foreground">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <ListEditor
                  label="Social links"
                  items={config.footer.socials}
                  onAdd={() =>
                    update((d) => d.footer.socials.push({ platform: "x", url: "" }))
                  }
                  onRemove={(i) => update((d) => d.footer.socials.splice(i, 1))}
                  onMove={(i, dir) => update((d) => move(d.footer.socials, i, dir))}
                  render={(item, i) => (
                    <div className="flex gap-2">
                      <SocialPlatformSelect
                        value={item.platform}
                        onChange={(p) =>
                          update((d) => (d.footer.socials[i].platform = p))
                        }
                      />
                      <Input
                        value={item.url}
                        onChange={(e) =>
                          update((d) => (d.footer.socials[i].url = e.target.value))
                        }
                        placeholder="https://…"
                        className="min-w-0 flex-1"
                      />
                    </div>
                  )}
                />
              </Section>

              {/* Theme */}
              <Section title="Theme" icon={Palette}>
                <Field label="Mode">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        update((d) => {
                          d.theme.mode = "light";
                          // Move the canvas to the light default only if the
                          // current one is dark — keep a deliberate light tint.
                          if (!isLightColor(d.theme.background)) {
                            d.theme.background = MODE_BG.light;
                          }
                        })
                      }
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150 ease-out",
                        config.theme.mode === "light"
                          ? "border-pine bg-sage/40 text-sage-ink"
                          : "text-muted-foreground hover:border-border",
                      )}
                    >
                      Light
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        update((d) => {
                          d.theme.mode = "dark";
                          if (isLightColor(d.theme.background)) {
                            d.theme.background = MODE_BG.dark;
                          }
                        })
                      }
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150 ease-out",
                        config.theme.mode === "dark"
                          ? "border-pine bg-sage/40 text-sage-ink"
                          : "text-muted-foreground hover:border-border",
                      )}
                    >
                      Dark
                    </button>
                  </div>
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
                      update(
                        (d) => (d.theme.font = e.target.value as "sans" | "serif" | "display" | "mono"),
                      )
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm transition-colors duration-150 ease hover:border-border focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine/20"
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
              <div className="h-2" />
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="overflow-hidden rounded-2xl border bg-muted/30 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b bg-card px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-red-500" />
                <span className="size-2.5 rounded-full bg-amber-500" />
                <span className="size-2.5 rounded-full bg-green-500" />
              </div>
              <div className="flex-1 truncate rounded-md bg-muted px-2.5 py-1 text-center text-xs text-muted-foreground">
                /
              </div>
              <div className="flex items-center gap-1 rounded-lg border p-0.5">
                {(["desktop", "mobile"] as const).map((d) => {
                  const Icon = d === "desktop" ? Monitor : Smartphone;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDevice(d)}
                      className={cn(
                        "rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40",
                        device === d
                          ? "bg-sage text-sage-ink"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      aria-label={`${d} preview`}
                      aria-pressed={device === d}
                      title={`${d[0].toUpperCase()}${d.slice(1)} preview`}
                    >
                      <Icon className="size-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[calc(100dvh-12rem)] overflow-auto bg-muted/30">
              {config.template === "" ? (
                <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
                  Choose a template to see the preview.
                </div>
              ) : (
                <PreviewFrame device={device} background={config.theme.background}>
                  <CareerPageRender
                    config={config}
                    workspace={workspace}
                    jobs={jobs}
                    boardRoot=""
                  />
                </PreviewFrame>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SocialPlatformSelect({
  value,
  onChange,
}: {
  value: SocialPlatform;
  onChange: (v: SocialPlatform) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex size-10 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40"
        title={SOCIAL_ICONS[value]?.label ?? value}
      >
        <SocialIcon platform={value} className="size-4" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-30 mt-1.5 w-44 origin-top-left rounded-xl border bg-popover p-1.5 shadow-lg duration-150 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
        >
          {socialPlatforms.map((p) => (
            <button
              key={p}
              type="button"
              role="option"
              aria-selected={value === p}
              onClick={() => { onChange(p); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                value === p ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              <SocialIcon platform={p} className="size-4 shrink-0" />
              {SOCIAL_ICONS[p].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function move<T>(arr: T[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

function Section({
  title,
  icon: Icon,
  defaultOpen,
  children,
}: {
  title: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-3.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-muted-foreground" strokeWidth={1.8} />
          {title}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | null;
  fallback: string;
  onChange: (color: string | null) => void;
}) {
  // `<input type=color>` needs a valid 6-digit hex; fall back when the field is
  // a partial value (e.g. mid-typing) or null.
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : fallback;
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-lg border bg-transparent"
          aria-label={label}
        />
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={fallback}
          className="min-w-0"
        />
      </div>
    </Field>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/**
 * Visual icon picker: shows the chosen icon, opens a searchable grid of the
 * shared CAREER_ICONS registry. Keyboard-accessible, outside-click close.
 */
function IconSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const hasIcon = Boolean(careerIcon(value));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CAREER_ICON_NAMES;
    return CAREER_ICON_NAMES.filter((n) => n.includes(q));
  }, [query]);

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `Icon: ${value}. Change icon` : "Choose an icon"}
        className="flex size-10 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40"
      >
        {hasIcon ? (
          <CareerIcon name={value} className="size-4 text-foreground" strokeWidth={1.8} />
        ) : (
          <ImageIcon className="size-4" strokeWidth={1.8} />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Icon picker"
          className="absolute right-0 z-30 mt-1.5 w-64 origin-top-right rounded-xl border bg-popover p-2 shadow-lg duration-150 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
        >
          <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons"
              aria-label="Search icons"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="mt-2 grid max-h-48 grid-cols-6 gap-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => pick("")}
              aria-label="No icon"
              aria-pressed={!value}
              title="No icon"
              className={cn(
                "flex aspect-square items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40",
                !value ? "border-pine bg-sage/30" : "border-transparent",
              )}
            >
              <Ban className="size-4" strokeWidth={1.8} />
            </button>
            {filtered.map((name) => {
              const Icon = CAREER_ICONS[name];
              const on = value === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => pick(name)}
                  aria-label={name}
                  aria-pressed={on}
                  title={name}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40",
                    on
                      ? "border-pine bg-sage/30 text-foreground"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} />
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="col-span-6 py-4 text-center text-xs text-muted-foreground">
                No match.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function ListEditor<T>({
  label,
  items,
  onAdd,
  onRemove,
  onMove,
  render,
}: {
  label: string;
  items: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  render: (item: T, i: number) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-pine transition-colors hover:bg-sage/40"
        >
          <Plus className="size-3.5" /> Add
        </button>
      </div>
      {items.map((item, i) => (
        <div
          key={i}
          className="rounded-lg border p-2.5 duration-200 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">{render(item, i)}</div>
            <div className="flex shrink-0 flex-col gap-0.5">
              <IconBtn onClick={() => onMove(i, -1)} disabled={i === 0} label="Move up">
                <ArrowUp className="size-3.5" />
              </IconBtn>
              <IconBtn
                onClick={() => onMove(i, 1)}
                disabled={i === items.length - 1}
                label="Move down"
              >
                <ArrowDown className="size-3.5" />
              </IconBtn>
              <IconBtn onClick={() => onRemove(i)} label="Remove">
                <Trash2 className="size-3.5 text-destructive" />
              </IconBtn>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function IconBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine/40 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

const DEVICE_WIDTH = { desktop: 1280, mobile: 390 } as const;

/**
 * True-to-life responsive preview. Children are portaled into an isolated
 * `<iframe>` document, so CSS media queries evaluate against the iframe's own
 * viewport width — the desktop/mobile toggle produces a *real* responsive
 * layout (a scaled `<div>` can't, since media queries read the page viewport).
 * The iframe is scaled down to fit the pane and transitions smoothly on switch.
 */
function PreviewFrame({
  device,
  background,
  children,
}: {
  device: "desktop" | "mobile";
  background: string;
  children: React.ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(640);

  const width = DEVICE_WIDTH[device];

  // Set up the iframe document once: clone the app's stylesheets in so Tailwind
  // applies, then expose the body as the portal mount node.
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.head.innerHTML = "";
    document
      .querySelectorAll('style, link[rel="stylesheet"]')
      .forEach((node) => doc.head.appendChild(node.cloneNode(true)));
    doc.body.style.margin = "0";
    setBody(doc.body);
  }, []);

  // Fit-to-pane scale + track content height as edits change it.
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer || !body) return;
    const recompute = () => {
      setScale(Math.min(1, outer.clientWidth / width));
      setContentHeight(body.scrollHeight);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(outer);
    ro.observe(body);
    return () => ro.disconnect();
  }, [width, body]);

  return (
    <div ref={outerRef} className="overflow-hidden p-3">
      <div
        className="mx-auto overflow-hidden rounded-xl border border-zinc-200 shadow-sm transition-[width,height] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: width * scale, height: contentHeight * scale, background }}
      >
        <iframe
          ref={iframeRef}
          title="Career page preview"
          className="origin-top-left border-0 transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{
            width,
            height: contentHeight,
            transform: `scale(${scale})`,
            pointerEvents: "none",
            background,
          }}
        />
      </div>
      {body ? createPortal(children, body) : null}
    </div>
  );
}
