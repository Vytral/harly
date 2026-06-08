"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Check,
  GripVertical,
  Lightbulb,
  MapPin,
  Megaphone,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import type { Job } from "@harly/db";

import {
  normalizeJobApplicationConfig,
  parseJobContentSections,
  parseKeywords,
  parseOfficePhotos,
  type JobContentSection,
} from "./config";
import { DepartmentCombobox } from "./DepartmentCombobox";
import { JobQuestionBuilder } from "./JobQuestionBuilder";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { generateJobDraftAction } from "./actions";

type JobFormProps = {
  action: (formData: FormData) => Promise<void>;
  job?: Job;
  submitLabel: string;
  departments: string[];
};

const employmentTypes = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];

const workplaceTypes = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
];

const currencies = ["USD", "EUR", "GBP", "CLP", "MXN", "ARS", "BRL", "COP"];

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

/** Escape user text before it goes into stored HTML (rendered with html-react-parser). */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Pick the closest built-in template from the job title (no-AI heuristic). */
function pickTemplateKey(title: string): keyof typeof SECTION_TEMPLATES {
  const t = title.toLowerCase();
  if (
    /(engineer|developer|programmer|software|backend|front[\s-]?end|full[\s-]?stack|data|devops|sre|qa)/.test(
      t,
    )
  ) {
    return "Engineering";
  }
  if (/(sales|account executive|business development|bdr|sdr|revenue)/.test(t)) {
    return "Sales";
  }
  return "Generic";
}

/** Wizard steps. One form underneath — steps just gate what's visible. */
const STEPS = [
  { key: "details", label: "Job details", hint: "Role, location & pay" },
  { key: "description", label: "Description", hint: "About the role" },
  { key: "application", label: "Application form", hint: "What candidates fill in" },
  { key: "publish", label: "Publish", hint: "Review & share" },
] as const;

const TIPS: Record<string, { heading: string; items: string[] }> = {
  details: {
    heading: "Writing a strong posting",
    items: [
      "Use a common job title — “Backend Engineer”, not “Code Ninja”. It lifts search visibility.",
      "One role per posting. Hiring two? Create two jobs.",
      "Listing a salary range measurably increases applications.",
    ],
  },
  description: {
    heading: "Describing the role",
    items: [
      "Lead with impact and team, not a wall of requirements.",
      "Use sections and templates so it stays scannable.",
      "Keep must-haves short — long lists scare off good candidates.",
    ],
  },
  application: {
    heading: "Designing the form",
    items: [
      "Ask only what you'll actually use to decide.",
      "Every extra required field lowers completion rate.",
      "Make profile links optional — not everyone has a GitHub.",
    ],
  },
  publish: {
    heading: "Getting candidates",
    items: [
      "Share the public link on LinkedIn, Slack and your network.",
      "Publishing adds it to your careers page instantly.",
      "Job-board and LinkedIn integrations are coming soon.",
    ],
  },
};

let sectionSeq = 0;
function newSectionId() {
  sectionSeq += 1;
  return `section-${Date.now()}-${sectionSeq}`;
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

/** Build initial sections: existing content, else migrate legacy requirements/benefits. */
function initialSectionsFor(job?: Job): JobContentSection[] {
  const existing = parseJobContentSections(job?.contentSections);
  if (existing.length > 0) return existing;

  const migrated: JobContentSection[] = [];
  if (job?.requirements) {
    migrated.push({ id: newSectionId(), title: "Requirements", body: job.requirements });
  }
  if (job?.benefits) {
    migrated.push({ id: newSectionId(), title: "Benefits", body: job.benefits });
  }
  return migrated;
}

export function JobForm({ action, job, submitLabel, departments }: JobFormProps) {
  const applicationConfig = normalizeJobApplicationConfig(job?.applicationConfig);

  const [title, setTitle] = useState<string>(job?.title ?? "");
  const [titleError, setTitleError] = useState(false);
  const [step, setStep] = useState(0);

  const [description, setDescription] = useState<string>(job?.description ?? "");
  const [sections, setSections] = useState<JobContentSection[]>(() =>
    initialSectionsFor(job),
  );
  const [keywords, setKeywords] = useState<string[]>(() => parseKeywords(job?.keywords));
  const [keywordDraft, setKeywordDraft] = useState("");
  const [photos, setPhotos] = useState<string[]>(() => parseOfficePhotos(job?.officePhotos));
  const [photoDraft, setPhotoDraft] = useState("");
  const [workplace, setWorkplace] = useState<string>(job?.workplaceType ?? "remote");
  const [office, setOffice] = useState(job?.officeAddress ?? "");
  // Bumped when we programmatically rewrite the main description, to remount
  // the uncontrolled editor with the new value (scaffold / AI generation).
  const [descriptionVersion, setDescriptionVersion] = useState(0);
  const [aiPending, startAi] = useTransition();

  const lastStep = STEPS.length - 1;
  const showOffice = workplace === "onsite" || workplace === "hybrid";
  const mapSrc = useMemo(() => {
    const q = office.trim();
    if (!q) return null;
    return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=14&output=embed`;
  }, [office]);

  function titleIsValid() {
    return title.trim().length >= 3;
  }
  function jumpTo(n: number) {
    setStep(Math.max(0, Math.min(lastStep, n)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goNext() {
    if (!titleIsValid()) {
      setTitleError(true);
      jumpTo(0);
      return;
    }
    jumpTo(step + 1);
  }
  /** Guard submits (draft + publish): a missing title would fail server-side. */
  function guardSubmit(event: React.MouseEvent) {
    if (!titleIsValid()) {
      event.preventDefault();
      setTitleError(true);
      jumpTo(0);
    }
  }

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

  /** No-AI "draft for me": template chosen by title + keywords injected as requirements. */
  function scaffoldDraft() {
    const base = SECTION_TEMPLATES[pickTemplateKey(title)].map((s) => ({
      ...s,
      id: newSectionId(),
    }));

    if (keywords.length > 0) {
      const list = `<ul>${keywords
        .map((keyword) => `<li>${escapeHtml(keyword)}</li>`)
        .join("")}</ul>`;
      const requirementsIndex = base.findIndex((s) => /require/i.test(s.title));
      if (requirementsIndex >= 0) {
        base[requirementsIndex] = { ...base[requirementsIndex], body: list };
      } else {
        base.push({ id: newSectionId(), title: "Requirements", body: list });
      }
    }

    const roleName = title.trim() || "this role";
    setSections(base);
    setDescription(
      `<p>We're hiring a <strong>${escapeHtml(roleName)}</strong> to join our team. Outline the mission, the team, and the impact of this role.</p>`,
    );
    setDescriptionVersion((version) => version + 1);
  }

  /** AI "generate": calls the workspace's configured provider; falls back to a toast if AI is off. */
  function generateWithAI() {
    if (!titleIsValid()) {
      setTitleError(true);
      jumpTo(0);
      toast.error("Add a job title first.");
      return;
    }

    startAi(async () => {
      const result = await generateJobDraftAction({
        title,
        workplaceType: workplace,
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
          body: `<ul>${section.bullets
            .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
            .join("")}</ul>`,
        })),
      );
      setDescription(`<p>${escapeHtml(draft.summary)}</p>`);
      setDescriptionVersion((version) => version + 1);
      toast.success("Draft generated with AI");
    });
  }

  function addKeyword() {
    const value = keywordDraft.trim();
    if (!value || keywords.includes(value)) return setKeywordDraft("");
    setKeywords((prev) => [...prev, value]);
    setKeywordDraft("");
  }
  function addPhoto() {
    const value = photoDraft.trim();
    if (!value || photos.includes(value)) return setPhotoDraft("");
    setPhotos((prev) => [...prev, value]);
    setPhotoDraft("");
  }

  const tip = TIPS[STEPS[step].key];

  return (
    <form action={action} className="pb-28">
      {job ? <input type="hidden" name="jobId" value={job.id} /> : null}
      <input type="hidden" name="contentSectionsJson" value={JSON.stringify(sections)} />
      <input type="hidden" name="keywordsJson" value={JSON.stringify(keywords)} />
      <input type="hidden" name="officePhotosJson" value={JSON.stringify(photos)} />

      <StepNav current={step} onJump={jumpTo} canAdvance={titleIsValid()} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          {/* ── Step 1 · Job details ── */}
          <StepPanel active={step === 0}>
            <Card>
              <CardHeader>
                <CardTitle>Role details</CardTitle>
                <CardDescription>
                  The basics candidates see first on your careers page.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="title">
                    Job title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="title"
                    name="title"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (titleError) setTitleError(false);
                    }}
                    aria-invalid={titleError}
                    placeholder="Senior Full Stack Engineer"
                  />
                  {titleError ? (
                    <p className="text-xs text-destructive">
                      Add a job title (at least 3 characters) to continue.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="slug">Public slug</Label>
                  <Input
                    id="slug"
                    name="slug"
                    defaultValue={job?.slug ?? ""}
                    placeholder="senior-full-stack-engineer"
                  />
                  <FieldHint>Leave blank to generate it from the title.</FieldHint>
                </div>

                <div className="space-y-2">
                  <Label>Department</Label>
                  <DepartmentCombobox
                    name="department"
                    departments={departments}
                    defaultValue={job?.department}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" name="location" defaultValue={job?.location ?? ""} placeholder="Remote, LATAM" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experienceLevel">Experience</Label>
                  <Input id="experienceLevel" name="experienceLevel" defaultValue={job?.experienceLevel ?? ""} placeholder="Mid / Senior · 3-5 years" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="education">Education</Label>
                  <Input id="education" name="education" defaultValue={job?.education ?? ""} placeholder="Not required / Bachelor's" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="employmentType">Employment type</Label>
                  <Select name="employmentType" defaultValue={job?.employmentType ?? "full_time"}>
                    <SelectTrigger id="employmentType" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {employmentTypes.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workplaceType">Workplace type</Label>
                  <Select name="workplaceType" value={workplace} onValueChange={setWorkplace}>
                    <SelectTrigger id="workplaceType" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {workplaceTypes.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {showOffice ? (
              <Card>
                <CardHeader>
                  <CardTitle>Office</CardTitle>
                  <CardDescription>
                    Help candidates picture where they&apos;ll work.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="officeAddress">Office address</Label>
                    <Input
                      id="officeAddress"
                      name="officeAddress"
                      value={office}
                      onChange={(e) => setOffice(e.target.value)}
                      placeholder="221B Baker Street, London"
                    />
                    <FieldHint>
                      <MapPin className="mr-1 inline size-3" />
                      We&apos;ll show an interactive map from this address — no API key needed.
                    </FieldHint>
                  </div>
                  {mapSrc ? (
                    <iframe key={mapSrc} src={mapSrc} title="Office location" className="h-64 w-full rounded-lg border" loading="lazy" />
                  ) : null}

                  <div className="space-y-2">
                    <Label>Office photos</Label>
                    <div className="flex gap-2">
                      <Input
                        value={photoDraft}
                        onChange={(e) => setPhotoDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addPhoto();
                          }
                        }}
                        placeholder="https://…/office.jpg"
                      />
                      <Button type="button" variant="outline" onClick={addPhoto}>
                        Add
                      </Button>
                    </div>
                    {photos.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {photos.map((url) => (
                          <div key={url} className="group relative overflow-hidden rounded-lg border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="Office" className="aspect-video w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setPhotos((prev) => prev.filter((p) => p !== url))}
                              className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                              aria-label="Remove photo"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Compensation</CardTitle>
                <CardDescription>
                  Optional — listing a range improves application rates.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="salaryMin">Salary min</Label>
                  <Input id="salaryMin" name="salaryMin" type="number" min="0" defaultValue={job?.salaryMin ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salaryMax">Salary max</Label>
                  <Input id="salaryMax" name="salaryMax" type="number" min="0" defaultValue={job?.salaryMax ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select name="currency" defaultValue={job?.currency ?? "USD"}>
                    <SelectTrigger id="currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salaryPeriod">Period</Label>
                  <Select name="salaryPeriod" defaultValue={job?.salaryPeriod ?? "annual"}>
                    <SelectTrigger id="salaryPeriod" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">Per year</SelectItem>
                      <SelectItem value="monthly">Per month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Keywords</CardTitle>
                <CardDescription>
                  Tags that help candidates and search find this role.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={keywordDraft}
                    onChange={(e) => setKeywordDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addKeyword();
                      }
                    }}
                    placeholder="react, remote, fintech…"
                  />
                  <Button type="button" variant="outline" onClick={addKeyword}>
                    Add
                  </Button>
                </div>
                {keywords.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((kw) => (
                      <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">
                        {kw}
                        <button
                          type="button"
                          onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`Remove ${kw}`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </StepPanel>

          {/* ── Step 2 · Description ── */}
          <StepPanel active={step === 1}>
            <Card>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="space-y-1.5">
                  <CardTitle>Description</CardTitle>
                  <CardDescription>
                    Tell candidates about the role. Add as many sections as you like — the structure is yours.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={generateWithAI}
                    disabled={aiPending}
                  >
                    <Sparkles className="size-4" />
                    {aiPending ? "Generating…" : "Generate with AI"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={scaffoldDraft}
                  >
                    <Wand2 className="size-4" />
                    Draft for me
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm">
                        <Sparkles className="size-4" />
                        Templates
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Replace with template</DropdownMenuLabel>
                      {Object.keys(SECTION_TEMPLATES).map((name) => (
                        <DropdownMenuItem key={name} onClick={() => applyTemplate(name as keyof typeof SECTION_TEMPLATES)}>
                          {name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>About the role</Label>
                  <input type="hidden" name="description" value={description} />
                  <RichTextEditor
                    key={`description-${descriptionVersion}`}
                    defaultValue={
                      descriptionVersion === 0 ? job?.description : description
                    }
                    placeholder="Describe the role, team, and impact."
                    minHeight="11rem"
                    onChange={setDescription}
                  />
                </div>

                {sections.map((section) => (
                  <div key={section.id} className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-center gap-2">
                      <GripVertical className="size-4 shrink-0 text-muted-foreground/60" />
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
                      placeholder="Write this section…"
                      minHeight="7rem"
                      onChange={(html) => updateSection(section.id, { body: html })}
                    />
                  </div>
                ))}

                <Button type="button" variant="outline" onClick={addSection}>
                  <Plus className="size-4" />
                  Add section
                </Button>
              </CardContent>
            </Card>
          </StepPanel>

          {/* ── Step 3 · Application form ── */}
          <StepPanel active={step === 2}>
            <Card>
              <CardHeader>
                <CardTitle>Application settings</CardTitle>
                <CardDescription>Control what candidates see when applying.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <label className="flex items-start justify-between gap-4 rounded-lg border bg-muted/40 p-4">
                  <span>
                    <span className="block text-sm font-medium">Require CV / resume</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      Candidates must upload a PDF, DOC, or DOCX.
                    </span>
                  </span>
                  <Switch name="resumeRequired" defaultChecked={applicationConfig.resumeRequired} />
                </label>

                <div className="space-y-3">
                  <p className="text-sm font-semibold">Candidate links (optional)</p>
                  <p className="text-sm text-muted-foreground">
                    Pick which profile links to offer — candidates can leave any of them blank.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <LinkToggle
                      name="profileLinkLinkedin"
                      requiredName="profileLinkLinkedinRequired"
                      label="LinkedIn"
                      setting={applicationConfig.profileLinks.linkedin}
                    />
                    <LinkToggle
                      name="profileLinkGithub"
                      requiredName="profileLinkGithubRequired"
                      label="GitHub"
                      setting={applicationConfig.profileLinks.github}
                    />
                    <LinkToggle
                      name="profileLinkWebsite"
                      requiredName="profileLinkWebsiteRequired"
                      label="Website / Portfolio"
                      setting={applicationConfig.profileLinks.website}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Custom questions</h3>
                  <JobQuestionBuilder initialQuestions={applicationConfig.questions} />
                </div>
              </CardContent>
            </Card>
          </StepPanel>

          {/* ── Step 4 · Publish ── */}
          <StepPanel active={step === 3}>
            <Card>
              <CardHeader>
                <CardTitle>Review &amp; publish</CardTitle>
                <CardDescription>
                  {job?.status === "open"
                    ? "Save your changes — they go live on your careers page immediately."
                    : "Publish to add this role to your public careers page, or keep it as a draft."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-x-6 gap-y-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
                  <ReviewRow label="Title" value={title || "—"} />
                  <ReviewRow label="Workplace" value={workplaceTypes.find((w) => w.value === workplace)?.label ?? workplace} />
                  <ReviewRow label="Sections" value={`${sections.length + (description.trim() ? 1 : 0)} block(s)`} />
                  <ReviewRow label="Custom questions" value={`${applicationConfig.questions.length}`} />
                </dl>
                <div className="flex items-start gap-3 rounded-xl border border-dashed p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Megaphone className="size-4" />
                  </span>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Source beyond your careers page</p>
                    <p className="text-sm text-muted-foreground">
                      One-click posting to LinkedIn and job boards is coming soon. For now,
                      publish and share the public link.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </StepPanel>
        </div>

        {/* ── Consejos rail ── */}
        <aside className="h-fit lg:sticky lg:top-20">
          <div className="rounded-2xl border border-border/70 bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Lightbulb className="size-4 text-primary" strokeWidth={2} />
              Tips
            </div>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {tip.heading}
            </p>
            <ul className="mt-2 space-y-3">
              {tip.items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* ── Sticky actions ── */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Button
          type="button"
          variant="ghost"
          onClick={() => jumpTo(step - 1)}
          className={cn(step === 0 && "invisible")}
        >
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button type="submit" name="intent" value="draft" variant="outline" onClick={guardSubmit}>
            Save as draft
          </Button>
          {step < lastStep ? (
            <Button type="button" size="lg" onClick={goNext}>
              Continue
            </Button>
          ) : (
            <Button type="submit" name="intent" value="continue" size="lg" onClick={guardSubmit}>
              <Share2 className="size-4" />
              {submitLabel}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function StepPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  // Hidden (not unmounted) so every field stays in the DOM and submits with the form.
  return <div className={cn("space-y-6", !active && "hidden")}>{children}</div>;
}

function StepNav({
  current,
  onJump,
  canAdvance,
}: {
  current: number;
  onJump: (n: number) => void;
  canAdvance: boolean;
}) {
  return (
    <ol className="flex items-stretch gap-2 overflow-x-auto rounded-2xl border border-border/70 bg-card p-2">
      {STEPS.map((s, i) => {
        const state = i === current ? "current" : i < current ? "done" : "upcoming";
        // Can't jump forward past step 1 until the title is valid.
        const reachable = i <= current || canAdvance;
        return (
          <li key={s.key} className="flex-1">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onJump(i)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                state === "current" && "bg-accent",
                state !== "current" && reachable && "hover:bg-muted",
                !reachable && "cursor-not-allowed opacity-50",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  state === "done" && "bg-primary text-primary-foreground",
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "upcoming" && "border bg-card text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="size-4" /> : i + 1}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    state === "current" ? "text-accent-foreground" : "text-foreground",
                  )}
                >
                  {s.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{s.hint}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0 sm:border-0 sm:pb-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

function LinkToggle({
  name,
  requiredName,
  label,
  setting,
}: {
  name: string;
  requiredName: string;
  label: string;
  setting: { enabled: boolean; required: boolean };
}) {
  const [enabled, setEnabled] = useState(setting.enabled);

  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <Switch
          name={name}
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </label>
      {enabled ? (
        <label className="mt-2.5 flex items-center justify-between gap-3 border-t pt-2.5">
          <span className="text-xs text-muted-foreground">
            Require candidates to fill this in
          </span>
          <Switch name={requiredName} defaultChecked={setting.required} />
        </label>
      ) : null}
    </div>
  );
}
