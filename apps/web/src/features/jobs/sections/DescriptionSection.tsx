import type { Job } from "@harly/db";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Info, Plus, Trash2, FileText } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import type { JobContentSection } from "../config";
import { generateJobDraftAction } from "../actions";
import { scrollWithinEditor } from "../scroll";
import { AiButton } from "@/components/ui/AiButton";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pickTemplateKey(title: string): "engineering" | "sales" | "generic" {
  const t = title.toLowerCase();
  if (/(engineer|developer|programmer|software|backend|front[\s-]?end|full[\s-]?stack|data|devops|sre|qa)/.test(t))
    return "engineering";
  if (/(sales|account executive|business development|bdr|sdr|revenue)/.test(t))
    return "sales";
  return "generic";
}

// Unique across sessions: ids of sections loaded from the DB must never collide
// with new ones (a module counter restarts at 1 on every page load, so "Add
// section" could mint an id already in use -> duplicate React keys -> editors
// vanishing/duplicating).
function newSectionId() {
  return `section-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function DescriptionSection({
  job,
  description,
  setDescription,
  descriptionVersion,
  setDescriptionVersion,
  sections,
  setSections,
  title,
  keywords,
  aiPending,
  startAi,
  aiConfigured,
  publishHint,
}: {
  job?: Job;
  description: string;
  setDescription: (html: string) => void;
  descriptionVersion: number;
  setDescriptionVersion: React.Dispatch<React.SetStateAction<number>>;
  sections: JobContentSection[];
  setSections: React.Dispatch<React.SetStateAction<JobContentSection[]>>;
  title: string;
  keywords: string[];
  aiPending: boolean;
  startAi: React.TransitionStartFunction;
  /** AI affordances are hidden entirely unless a provider is usable. */
  aiConfigured: boolean;
  /** Inline explanation of what publishing needs; null when satisfied. */
  publishHint: string | null;
}) {
  const t = useTranslations("jobs.description");
  const bulletList = (items: string[]) => `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  const templates = {
    engineering: [
      { title: t("templateWhatYouDo"), body: bulletList([t("templateShipFeatures"), t("templateCollaborate")]) },
      { title: t("templateRequirements"), body: bulletList([t("templateYearsWeb"), t("templateTypeScript")]) },
      { title: t("templateBenefits"), body: bulletList([t("templateRemoteFirst"), t("templateEquity")]) },
    ],
    sales: [
      { title: t("templateAboutRole"), body: `<p>${escapeHtml(t("templateSalesMission"))}</p>` },
      { title: t("templateRequirements"), body: bulletList([t("templateYearsSales"), t("templateCrm")]) },
      { title: t("templateCompensation"), body: `<p>${escapeHtml(t("templateCommission"))}</p>` },
    ],
    generic: [
      { title: t("templateResponsibilities"), body: "" },
      { title: t("templateRequirements"), body: "" },
      { title: t("templateBenefits"), body: "" },
    ],
  };
  const templateLabels = {
    engineering: t("template.engineering"),
    sales: t("template.sales"),
    generic: t("template.generic"),
  };
  const newSectionRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // After "Add section": focus the new title WITHOUT letting the browser scroll
  // every ancestor, then scroll only the editor's own scroll root if needed.
  useEffect(() => {
    const id = newSectionRef.current;
    if (!id) return;
    newSectionRef.current = null;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-preview-target="section:${id}"]`,
    );
    if (!el) return;
    el.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    scrollWithinEditor(el, { align: "nearest", bottomInset: 80 });
  }, [sections]);

  function updateSection(id: string, patch: Partial<JobContentSection>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addSection() {
    const id = newSectionId();
    newSectionRef.current = id;
    setSections((prev) => [...prev, { id, title: "", body: "" }]);
  }

  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  function applyTemplate(name: keyof typeof templates) {
    setSections(templates[name].map((s) => ({ ...s, id: newSectionId() })));
  }

  function scaffoldDraft() {
    const base = templates[pickTemplateKey(title)].map((s) => ({
      ...s,
      id: newSectionId(),
    }));

    if (keywords.length > 0) {
      const list = `<ul>${keywords.map((kw) => `<li>${escapeHtml(kw)}</li>`).join("")}</ul>`;
      const ri = base.findIndex((s) => /require/i.test(s.title));
      if (ri >= 0) base[ri] = { ...base[ri], body: list };
      else base.push({ id: newSectionId(), title: "Requirements", body: list });
    }

    const roleName = title.trim() || t("thisRole");
    setSections(base);
    setDescription(
      `<p>${escapeHtml(t("outlineTemplate", { roleName }))}</p>`,
    );
    setDescriptionVersion((v) => v + 1);
  }

  function generateWithAI() {
    if (title.trim().length < 3) {
      toast.error(t("titleRequired"));
      return;
    }

    startAi(async () => {
      const result = await generateJobDraftAction({
        title,
        workplaceType: "remote",
        keywords,
      });

      if (!result.ok) {
        toast.error(
          result.code === "aiDraftNotConfigured"
            ? t("aiNotConfigured")
            : result.code === "aiGenerationFailed"
              ? t("generationFailed")
              : result.error,
        );
        return;
      }

      const { draft } = result;
      setSections(
        draft.sections.map((section) => ({
          id: newSectionId(),
          title: section.title,
          body: `<ul>${section.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`,
        })),
      );
      setDescription(`<p>${escapeHtml(draft.summary)}</p>`);
      setDescriptionVersion((v) => v + 1);
      toast.success(t("draftGenerated"));
    });
  }

  return (
    <section data-section="description">
      <div className="rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <p className="text-sm font-semibold">{t("description")}</p>
          <div className="flex items-center gap-2">
            {aiConfigured ? (
              <AiButton
                type="button"
                size="sm"
                onClick={generateWithAI}
                loading={aiPending}
                loadingText={t("generating")}
                logoClassName="size-4"
              >
                {t("generateWithAi")}
              </AiButton>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={scaffoldDraft}>
              <FileText className="size-4" />
              {t("insertOutline")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  {t("templates")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("replaceWithTemplate")}</DropdownMenuLabel>
                {Object.keys(templates).map((name) => (
                  <DropdownMenuItem
                    key={name}
                    onClick={() => applyTemplate(name as keyof typeof templates)}
                  >
                    {templateLabels[name as keyof typeof templateLabels]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div ref={listRef} className="space-y-5 p-5">
          {publishHint ? (
            <p className="flex items-start gap-2 rounded-[var(--radius-inner)] bg-card-inset px-3 py-2 text-[13px] text-soft-ink">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {publishHint}
            </p>
          ) : null}
          <div className="space-y-2" data-preview-target="description">
            <Label>{t("aboutRole")}</Label>
            <input type="hidden" name="description" value={description} />
            <RichTextEditor
              key={`description-${descriptionVersion}`}
              defaultValue={descriptionVersion === 0 ? job?.description : description}
              placeholder={t("descriptionPlaceholder")}
              minHeight="11rem"
              onChange={setDescription}
            />
          </div>

          {sections.map((section) => (
            <div
              key={section.id}
              data-preview-target={`section:${section.id}`}
              className="rounded-[var(--radius-inner)] bg-card-inset p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <Input
                  value={section.title}
                  onChange={(e) => updateSection(section.id, { title: e.target.value })}
                  placeholder={t("sectionTitlePlaceholder")}
                  className="h-9 bg-card font-medium"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSection(section.id)}
                  aria-label={t("removeSection")}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <RichTextEditor
                defaultValue={section.body}
                placeholder={t("sectionBodyPlaceholder")}
                minHeight="7rem"
                onChange={(html) => updateSection(section.id, { body: html })}
              />
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addSection}>
            <Plus className="size-4" />
            {t("addSection")}
          </Button>
        </div>
      </div>
    </section>
  );
}
