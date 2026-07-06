import type { Job } from "@harly/db";
import { Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

import type { JobContentSection } from "../config";
import { generateJobDraftAction } from "../actions";
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

const SECTION_TEMPLATES: Record<string, { title: string; body: string }[]> = {
  Engineering: [
    { title: "What you'll do", body: "<ul><li>Ship features end to end</li><li>Collaborate on architecture</li></ul>" },
    { title: "Requirements", body: "<ul><li>3+ years building web apps</li><li>Strong in TypeScript</li></ul>" },
    { title: "Benefits", body: "<ul><li>Remote-first</li><li>Equity</li></ul>" },
  ],
  Sales: [
    { title: "About the role", body: "<p>Own a pipeline and close deals.</p>" },
    { title: "Requirements", body: "<ul><li>2+ years in B2B sales</li><li>CRM fluency</li></ul>" },
    { title: "Compensation", body: "<p>Base + uncapped commission.</p>" },
  ],
  Generic: [
    { title: "Responsibilities", body: "" },
    { title: "Requirements", body: "" },
    { title: "Benefits", body: "" },
  ],
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pickTemplateKey(title: string): keyof typeof SECTION_TEMPLATES {
  const t = title.toLowerCase();
  if (/(engineer|developer|programmer|software|backend|front[\s-]?end|full[\s-]?stack|data|devops|sre|qa)/.test(t))
    return "Engineering";
  if (/(sales|account executive|business development|bdr|sdr|revenue)/.test(t))
    return "Sales";
  return "Generic";
}

let sectionSeq = 0;
function newSectionId() {
  sectionSeq += 1;
  return `section-${sectionSeq}`;
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
}) {
  function updateSection(id: string, patch: Partial<JobContentSection>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addSection() {
    setSections((prev) => [...prev, { id: newSectionId(), title: "", body: "" }]);
  }

  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  function applyTemplate(name: keyof typeof SECTION_TEMPLATES) {
    setSections(SECTION_TEMPLATES[name].map((s) => ({ ...s, id: newSectionId() })));
  }

  function scaffoldDraft() {
    const base = SECTION_TEMPLATES[pickTemplateKey(title)].map((s) => ({
      ...s,
      id: newSectionId(),
    }));

    if (keywords.length > 0) {
      const list = `<ul>${keywords.map((kw) => `<li>${escapeHtml(kw)}</li>`).join("")}</ul>`;
      const ri = base.findIndex((s) => /require/i.test(s.title));
      if (ri >= 0) base[ri] = { ...base[ri], body: list };
      else base.push({ id: newSectionId(), title: "Requirements", body: list });
    }

    const roleName = title.trim() || "this role";
    setSections(base);
    setDescription(
      `<p>We're hiring a <strong>${escapeHtml(roleName)}</strong> to join our team. Outline the mission, the team, and the impact of this role.</p>`,
    );
    setDescriptionVersion((v) => v + 1);
  }

  function generateWithAI() {
    if (title.trim().length < 3) {
      toast.error("Add a job title first.");
      return;
    }

    startAi(async () => {
      const result = await generateJobDraftAction({
        title,
        workplaceType: "remote",
        keywords,
      });

      if (!result.ok) {
        toast.error(result.error);
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
      toast.success("Draft generated with AI");
    });
  }

  return (
    <section data-section="description">
      <div className="rounded-2xl border border-border/70 bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <p className="text-sm font-semibold">Description</p>
          <div className="flex items-center gap-2">
            <AiButton
              type="button"
              size="sm"
              onClick={generateWithAI}
              loading={aiPending}
              loadingText="Generating"
            >
              Generate with AI
            </AiButton>
            <Button type="button" variant="outline" size="sm" onClick={scaffoldDraft}>
              <FileText className="size-4" />
              Draft for me
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Templates
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Replace with template</DropdownMenuLabel>
                {Object.keys(SECTION_TEMPLATES).map((name) => (
                  <DropdownMenuItem
                    key={name}
                    onClick={() => applyTemplate(name as keyof typeof SECTION_TEMPLATES)}
                  >
                    {name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="space-y-2">
            <Label>About the role</Label>
            <input type="hidden" name="description" value={description} />
            <RichTextEditor
              key={`description-${descriptionVersion}`}
              defaultValue={descriptionVersion === 0 ? job?.description : description}
              placeholder="Describe the role, team, and impact."
              minHeight="11rem"
              onChange={setDescription}
            />
          </div>

          {sections.map((section) => (
            <div key={section.id} className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Input
                  value={section.title}
                  onChange={(e) => updateSection(section.id, { title: e.target.value })}
                  placeholder="Section title (e.g. Requirements)"
                  className="h-9 bg-card font-medium"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSection(section.id)}
                  aria-label="Remove section"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <RichTextEditor
                defaultValue={section.body}
                placeholder="Write this section..."
                minHeight="7rem"
                onChange={(html) => updateSection(section.id, { body: html })}
              />
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addSection}>
            <Plus className="size-4" />
            Add section
          </Button>
        </div>
      </div>
    </section>
  );
}
