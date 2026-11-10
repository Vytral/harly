"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { toast } from "@/lib/notification-island/toast";
import DOMPurify from "dompurify";
import { useTranslations } from "next-intl";

import {
  createEmailTemplate,
  deleteEmailTemplate,
  setActiveEmailTemplate,
  updateEmailTemplate,
} from "@/features/email-templates/actions";
import {
  SYSTEM_TEMPLATE_TYPES,
  type EmailTemplateItem,
  type TemplateType,
} from "@/features/email-templates/shared";
import {
  findUnknownVariables,
  interpolateTemplate,
  TEMPLATE_VARIABLES,
} from "@/features/email-templates/interpolate";
import {
  CaretRightIcon,
  FileTextIcon,
  PlusIcon,
  SearchIcon,
  StarFillIcon,
  StarIcon,
  TrashIcon,
} from "@/components/ui/icons/phosphor";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { FilterPill } from "@/components/ui/FilterPill";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetClose } from "@/components/ui/sheet";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

// ─── Constants ───────────────────────────────────────────────────────────────

const TEMPLATE_TYPES: TemplateType[] = ["general", "interview_invite", "rejection", "offer", "screening", "stage_change"];

const TEMPLATE_TYPE_COLORS: Record<TemplateType, string> = {
  general: "bg-soft-kraft text-soft-ink",
  interview_invite: "bg-status-quiet text-status-quiet-ink",
  rejection: "bg-danger-rust/10 text-danger-rust",
  offer: "bg-lime-wash text-sage-ink",
  screening: "bg-warning-clay/10 text-warning-clay",
  stage_change: "bg-sage-wash text-sage-ink",
};

const TYPE_CHIP = "w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold";

/** Types with a matching system auto-email , these can be "activated" to override the default. */
const ACTIVATABLE_TYPES = new Set<TemplateType>(SYSTEM_TEMPLATE_TYPES);
const MANUAL_TEMPLATE_TYPES: TemplateType[] = ["general", "screening"];

function isAutomaticTemplateType(type: TemplateType) {
  return ACTIVATABLE_TYPES.has(type);
}

function typeDescriptionKey(type: TemplateType): "typeDescriptionAutomatic" | "typeDescriptionManual" {
  return isAutomaticTemplateType(type) ? "typeDescriptionAutomatic" : "typeDescriptionManual";
}

// Groups for the variable pill picker
const VARIABLE_GROUPS = Array.from(
  TEMPLATE_VARIABLES.reduce((map, v) => {
    if (!map.has(v.group)) map.set(v.group, []);
    map.get(v.group)!.push(v);
    return map;
  }, new Map<string, typeof TEMPLATE_VARIABLES[number][]>()),
);

// Starter templates shown when the workspace has no templates yet
// Starter bodies live in the catalog (`starters.<key>.body`), keyed by starter id.
const STARTER_TEMPLATES: Array<{
  key: "interviewInvitation" | "applicationRejection" | "offerExtended" | "screeningCall" | "stageUpdate";
  type: TemplateType;
}> = [
  { key: "interviewInvitation", type: "interview_invite" },
  { key: "applicationRejection", type: "rejection" },
  { key: "offerExtended", type: "offer" },
  { key: "screeningCall", type: "screening" },
  { key: "stageUpdate", type: "stage_change" },
];

const PREVIEW_URLS = {
  interview_location: "https://meet.google.com/abc-xyz",
  offer_url: "https://jobs.acme.com/portal/applications/offer-123",
  portal_link: "https://jobs.acme.com/portal",
};

const EMPTY_DRAFT = {
  name: "",
  type: "general" as TemplateType,
  subject: "",
  body: "",
};

type TemplateDraft = typeof EMPTY_DRAFT;

// ─── TemplatesManager ─────────────────────────────────────────────────────────

export function TemplatesManager({
  templates,
  workspaceName,
}: {
  templates: EmailTemplateItem[];
  workspaceName: string;
}) {
  const t = useTranslations("features.emailTemplates.templatesManager");
  const tLabels = useTranslations("labels.emailTemplates");
  const typeLabel = (type: TemplateType) => t(`typeLabels.${type}`);
  const tSamples = useTranslations("labels.emailTemplates.samples");
  const previewValues = {
    candidate_first_name: "Ava",
    candidate_last_name: "Thompson",
    candidate_full_name: "Ava Thompson",
    job_title: tSamples("jobTitle"),
    stage_name: tSamples("stageName"),
    interview_date: tSamples("interviewDate"),
    interview_time: tSamples("interviewTime"),
    interview_location: PREVIEW_URLS.interview_location,
    offer_salary: tSamples("offerSalary"),
    offer_expiry: tSamples("offerExpiry"),
    offer_url: PREVIEW_URLS.offer_url,
    company_name: workspaceName,
    portal_link: PREVIEW_URLS.portal_link,
    sender_name: tSamples("senderName"),
  };
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplateItem | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<TemplateType | "all">("all");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [showStarters, setShowStarters] = useState(false);
  const [editorKey] = useState(0);

  const [name, setName] = useState(EMPTY_DRAFT.name);
  const [type, setType] = useState<TemplateType>(EMPTY_DRAFT.type);
  const [subject, setSubject] = useState(EMPTY_DRAFT.subject);
  const [body, setBody] = useState(EMPTY_DRAFT.body);
  const [initialDraft] = useState<TemplateDraft>(EMPTY_DRAFT);

  // Ref handle exposed by RichTextEditor , lets us insert at cursor
  const editorRef = useRef<{ insertText: (text: string) => void } | null>(null);

  const isDirty =
    name.trim() !== initialDraft.name ||
    type !== initialDraft.type ||
    subject.trim() !== initialDraft.subject ||
    body !== initialDraft.body;

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "all" || t.type === filterType;
    return matchesSearch && matchesType;
  });

  const unknownVariables = findUnknownVariables(`${subject}\n${body}`);

  function openNew(prefill?: typeof STARTER_TEMPLATES[number]) {
    void prefill;
    router.push("/dashboard/templates/new" as Route);
    setShowStarters(false);
  }

  function openEdit(template: EmailTemplateItem) {
    router.push(`/dashboard/templates/${template.id}` as Route);
  }

  function closeEditor() {
    setOpen(false);
    setEditing(null);
  }

  function save() {
    startTransition(async () => {
      const fields = { name, type, subject, body };
      const result = editing
        ? await updateEmailTemplate({ templateId: editing.id, ...fields })
        : await createEmailTemplate(fields);

      if (!result.success) {
        toast.error(result.error ?? t("saveFailed"));
        return;
      }
      toast.success(editing ? t("templateUpdated") : t("templateCreated"));
      closeEditor();
      router.refresh();
    });
  }

  async function remove(template: EmailTemplateItem) {
    if (
      !(await confirm({
        tone: "destructive",
        title: t("deleteTitle", { name: template.name }),
        description: t("deleteDescription"),
        confirmLabel: t("deleteConfirm"),
      }))
    )
      return;
    startTransition(async () => {
      const result = await deleteEmailTemplate({ templateId: template.id });
      if (!result.success) {
        toast.error(result.error ?? t("deleteFailed"));
        return;
      }
      toast.success(t("templateDeleted"));
      router.refresh();
    });
  }

  function toggleActive(template: EmailTemplateItem) {
    startTransition(async () => {
      const result = await setActiveEmailTemplate({
        templateId: template.id,
        active: !template.isActive,
      });
      if (!result.success) {
        toast.error(result.error ?? t("updateFailed"));
        return;
      }
      toast.success(
        template.isActive
          ? t("revertedNotice")
          : t("activatedNotice", { type: typeLabel(template.type).toLowerCase() }),
      );
      router.refresh();
    });
  }

  // Strip HTML tags for plain-text preview of body in cards
  function stripHtml(html: string) {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const typeOptions = TEMPLATE_TYPES;

  function renderStarter(starter: (typeof STARTER_TEMPLATES)[number]) {
    return (
      <button
        key={starter.key}
        type="button"
        onClick={() => openNew(starter)}
        className="group flex w-full items-center gap-3 rounded-[var(--radius-inner)] px-3 py-3 text-left transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
          <FileTextIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-near-ink">{t(`starters.${starter.key}.name`)}</span>
            <span className={cn(TYPE_CHIP, TEMPLATE_TYPE_COLORS[starter.type])}>
              {typeLabel(starter.type)}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-soft-ink">{t(`starters.${starter.key}.subject`)}</span>
        </span>
        <CaretRightIcon className="size-4 shrink-0 text-quiet-mist transition-transform group-hover:translate-x-0.5" />
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {templates.length > 0 && (
            <>
              <div className="relative w-full sm:w-64">
                <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-quiet-mist" />
                <Input
                  aria-label={t("searchLabel")}
                  placeholder={t("searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="rounded-full pl-9"
                />
              </div>
              <FilterPill
                label={t("typeFilter")}
                value={filterType}
                onChange={(v) => setFilterType(v as TemplateType | "all")}
                options={["all", ...typeOptions]}
                labelMap={{ all: t("allTypes"), ...Object.fromEntries(typeOptions.map((type) => [type, typeLabel(type)])) }}
                allValue="all"
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {templates.length > 0 ? (
            <Button variant="outline" onClick={() => setShowStarters((visible) => !visible)}>
              {showStarters ? t("hideStarters") : t("useStarter")}
            </Button>
          ) : null}
          <Button onClick={() => openNew()}>
            <PlusIcon className="size-4" />
            {t("newTemplate")}
          </Button>
        </div>
      </div>

      <Callout tone="info">
        {t("automaticNotice")}
      </Callout>

      {templates.length > 0 && showStarters ? (
        <Card className="gap-2 p-4">
          <div className="px-2">
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-near-ink">{t("startFromTemplate")}</p>
            <p className="text-[13px] text-soft-ink">{t("startFromTemplateHelp")}</p>
          </div>
          <div className="space-y-0.5">
            {STARTER_TEMPLATES.map(renderStarter)}
          </div>
        </Card>
      ) : null}

      {/* Empty state */}
      {templates.length === 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-[var(--radius-card)] bg-lime-wash px-5 py-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-btn)] bg-pure-snow text-near-ink">
              <FileTextIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-near-ink">{t("emptyTitle")}</p>
              <p className="mt-0.5 text-sm text-soft-ink">
                {t.rich("emptyDescription", {
                  variable: "{{candidate_first_name}}",
                  code: (chunks) => <code className="rounded bg-pure-snow px-1 py-0.5 text-xs">{chunks}</code>,
                })}
              </p>
            </div>
          </div>
          <Card className="gap-1 p-3">
            {STARTER_TEMPLATES.map(renderStarter)}
          </Card>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <EmptyState
          variant="filtered"
          icon={FileTextIcon}
          title={t("noMatchTitle")}
          description={t("noMatchDescription")}
        />
      ) : (
        <Card className="gap-0 divide-y divide-hairline overflow-hidden py-0">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="group flex items-start gap-3 px-4 py-4 transition-colors hover:bg-row-wash"
            >
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
                <FileTextIcon className="size-4" />
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => openEdit(template)}
                className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-near-ink">{template.name}</span>
                  <span className={cn(TYPE_CHIP, TEMPLATE_TYPE_COLORS[template.type])}>
                    {typeLabel(template.type)}
                  </span>
                  <span className="text-[11px] text-soft-ink">
                    {isAutomaticTemplateType(template.type) ? t("automatic") : t("manualOnly")}
                  </span>
                  {template.isActive ? (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-lime-wash px-2 py-0.5 text-[11px] font-semibold text-sage-ink">
                      <span aria-hidden className="size-1.5 rounded-full bg-success-olive" />
                      {t("active")}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block truncate text-[13px] font-medium text-near-ink/80">{template.subject}</span>
                <span className="mt-0.5 line-clamp-1 text-[13px] text-soft-ink">{stripHtml(template.body)}</span>
                <span className="mt-1 block text-xs text-quiet-mist">
                  {t.rich("updatedAgo", { time: () => <RelativeTime value={template.updatedAt} /> })}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {ACTIVATABLE_TYPES.has(template.type) ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn("size-8", template.isActive ? "text-success-olive" : "text-soft-ink")}
                    aria-label={
                      template.isActive
                        ? t("stopUsingAria", { name: template.name })
                        : t("useForAria", { name: template.name, type: typeLabel(template.type).toLowerCase() })
                    }
                    title={
                      template.isActive
                        ? t("activeTitle")
                        : t("useTitle")
                    }
                    disabled={isPending}
                    onClick={() => toggleActive(template)}
                  >
                    {template.isActive ? (
                      <StarFillIcon className="size-4" />
                    ) : (
                      <StarIcon className="size-4" />
                    )}
                  </Button>
                ) : null}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-soft-ink hover:text-danger-rust"
                  aria-label={t("deleteAria", { name: template.name })}
                  disabled={isPending}
                  onClick={() => remove(template)}
                >
                  <TrashIcon className="size-4" />
                </Button>
                <CaretRightIcon aria-hidden className="size-4 text-quiet-mist" />
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Editor sheet */}
      <Sheet
        open={open}
        mobilePresentation="side"
        onOpenChange={async (next) => {
          if (
            !next &&
            isDirty &&
            !(await confirm({
              tone: "warning",
              title: t("discardChangesTitle"),
              description: t("discardChangesDescription"),
              confirmLabel: t("discardChangesConfirm"),
              cancelLabel: t("keepEditing"),
            }))
          )
            return;
          if (!next) closeEditor();
          else setOpen(true);
        }}
      >
        <DrawerLayout
          title={editing ? t("editTitle") : t("newTitle")}
          description={t("sheetDescription")}
          className="inset-0 h-dvh max-h-none w-screen max-w-none rounded-none border-0 sm:max-w-none"
          footer={
            <>
              <SheetClose asChild>
                <Button variant="outline" disabled={isPending}>{t("cancel")}</Button>
              </SheetClose>
              <Button
                onClick={save}
                disabled={isPending || !name.trim() || !subject.trim() || !body.trim()}
              >
                {isPending ? t("saving") : t("save")}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            {/* Name + type row */}
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
              <div className="flex-1 space-y-2">
                <Label htmlFor="template-name">{t("nameLabel")}</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("typeLabel")}</Label>
                <Select value={type} onValueChange={(v) => setType(v as TemplateType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{t("automaticGroup")}</SelectLabel>
                      {SYSTEM_TEMPLATE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{t("manualGroup")}</SelectLabel>
                      {MANUAL_TEMPLATE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="text-xs leading-4 text-muted-foreground">{t(typeDescriptionKey(type))}</p>
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="template-subject">{t("subjectLabel")}</Label>
              <Input
                id="template-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("subjectPlaceholder")}
              />
            </div>

            {/* Body , edit / preview tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("bodyLabel")}</Label>
                <div className="flex rounded-full bg-soft-kraft p-0.5">
                  <button
                    type="button"
                    onClick={() => setTab("edit")}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium transition",
                      tab === "edit" ? "bg-pure-snow text-near-ink" : "text-soft-ink hover:text-near-ink",
                    )}
                  >
                    {t("edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("preview")}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium transition",
                      tab === "preview" ? "bg-pure-snow text-near-ink" : "text-soft-ink hover:text-near-ink",
                    )}
                  >
                    {t("preview")}
                  </button>
                </div>
              </div>

              {tab === "edit" ? (
                <>
                  <RichTextEditor
                key={editorKey}
                    defaultValue={body}
                    onChange={setBody}
                    editorRef={editorRef}
                    placeholder={t("bodyPlaceholder")}
                    minHeight="min(56vh,42rem)"
                  />

                  {/* Variable pills grouped */}
                  <div className="space-y-2 pt-1">
                    {VARIABLE_GROUPS.map(([group, vars]) => (
                      <div key={group}>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{tLabels(`groups.${group}`)}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {vars.map((variable) => (
                            <button
                              key={variable.key}
                              type="button"
                              onClick={() => editorRef.current?.insertText(`{{${variable.key}}}`)}
                              className="cursor-pointer rounded-full bg-card-inset px-2.5 py-0.5 text-xs font-medium text-soft-ink transition hover:bg-row-wash hover:text-near-ink"
                              title={tLabels(`variables.${variable.labelKey}`)}
                            >
                              {`{{${variable.key}}}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {unknownVariables.length > 0 && (
                    <p className="text-xs text-warning-clay">
                      {t("unknownVariables", { count: unknownVariables.length, variables: unknownVariables.map((v) => `{{${v}}}`).join(", ") })}
                    </p>
                  )}
                </>
              ) : (
                /* Preview panel */
                <div className="rounded-[var(--radius-card)] bg-pure-snow p-5 shadow-[var(--shadow-card)]">
                  {subject.trim() && (
                    <p className="mb-4 border-b border-border/50 pb-3 text-[13px] font-semibold text-foreground">
                      {interpolateTemplate(subject, previewValues)}
                    </p>
                  )}
                  {body ? (
                    <div
                      className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground/90 prose-p:my-2 prose-ul:my-2 prose-ol:my-2"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(
                          interpolateTemplate(body, previewValues),
                          { ALLOWED_TAGS: ["p","br","strong","em","s","ul","ol","li","h1","h2","blockquote","a"], ALLOWED_ATTR: ["href"] },
                        ),
                      }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("nothingToPreview")}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </DrawerLayout>
      </Sheet>
    </div>
  );
}
