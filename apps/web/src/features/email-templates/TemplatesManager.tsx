"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";

import {
  createEmailTemplate,
  deleteEmailTemplate,
  updateEmailTemplate,
} from "@/features/email-templates/actions";
import type { EmailTemplateItem, TemplateType } from "@/features/email-templates/data";
import {
  findUnknownVariables,
  interpolateTemplate,
  TEMPLATE_VARIABLES,
} from "@/features/email-templates/interpolate";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetClose } from "@/components/ui/sheet";
import { RelativeTime } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";

// ─── Constants ───────────────────────────────────────────────────────────────

const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  general: "General",
  interview_invite: "Interview",
  rejection: "Rejection",
  offer: "Offer",
  screening: "Screening",
};

const TEMPLATE_TYPE_COLORS: Record<TemplateType, string> = {
  general: "bg-muted text-muted-foreground",
  interview_invite: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  rejection: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  offer: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  screening: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

// Groups for the variable pill picker
const VARIABLE_GROUPS = Array.from(
  TEMPLATE_VARIABLES.reduce((map, v) => {
    if (!map.has(v.group)) map.set(v.group, []);
    map.get(v.group)!.push(v);
    return map;
  }, new Map<string, typeof TEMPLATE_VARIABLES[number][]>()),
);

// Starter templates shown when the workspace has no templates yet
const STARTER_TEMPLATES: Array<{
  name: string;
  type: TemplateType;
  subject: string;
  body: string;
}> = [
  {
    name: "Interview invitation",
    type: "interview_invite",
    subject: "Interview invitation — {{job_title}} at {{company_name}}",
    body: "<p>Hi {{candidate_first_name}},</p><p>We'd love to invite you to an interview for the <strong>{{job_title}}</strong> role at {{company_name}}.</p><p><strong>Date:</strong> {{interview_date}}<br><strong>Time:</strong> {{interview_time}}<br><strong>Location:</strong> {{interview_location}}</p><p>Please let us know if this works for you.</p><p>Best,<br>{{sender_name}}</p>",
  },
  {
    name: "Application rejection",
    type: "rejection",
    subject: "Your application for {{job_title}}",
    body: "<p>Hi {{candidate_first_name}},</p><p>Thank you for your interest in the <strong>{{job_title}}</strong> position at {{company_name}} and for taking the time to apply.</p><p>After careful consideration, we've decided to move forward with other candidates whose experience more closely matches our current needs.</p><p>We'll keep your profile on file and encourage you to apply for future openings that may be a better fit.</p><p>Best of luck,<br>{{sender_name}}</p>",
  },
  {
    name: "Offer extended",
    type: "offer",
    subject: "Offer letter — {{job_title}} at {{company_name}}",
    body: "<p>Hi {{candidate_first_name}},</p><p>We're thrilled to offer you the <strong>{{job_title}}</strong> position at {{company_name}}.</p><p><strong>Compensation:</strong> {{offer_salary}}<br><strong>Offer expires:</strong> {{offer_expiry}}</p><p>Please review the attached offer letter and let us know if you have any questions.</p><p>We're excited to have you on board,<br>{{sender_name}}</p>",
  },
  {
    name: "Screening call",
    type: "screening",
    subject: "Quick intro call — {{job_title}}",
    body: "<p>Hi {{candidate_first_name}},</p><p>We reviewed your application for <strong>{{job_title}}</strong> at {{company_name}} and we're impressed with your background.</p><p>We'd love to schedule a quick 30-minute call to learn more about you and share details about the role.</p><p>Looking forward to connecting,<br>{{sender_name}}</p>",
  },
];

const PREVIEW_VALUES = {
  candidate_first_name: "Ava",
  candidate_last_name: "Thompson",
  candidate_full_name: "Ava Thompson",
  job_title: "Senior Frontend Engineer",
  stage_name: "Technical Interview",
  interview_date: "Tuesday, July 8",
  interview_time: "10:00 AM PST",
  interview_location: "https://meet.google.com/abc-xyz",
  offer_salary: "$140,000 / yr",
  offer_expiry: "July 12, 2026",
  company_name: "Acme Inc.",
  portal_link: "https://jobs.acme.com/portal",
  sender_name: "You",
};

// ─── TemplatesManager ─────────────────────────────────────────────────────────

export function TemplatesManager({
  templates,
  workspaceName,
}: {
  templates: EmailTemplateItem[];
  workspaceName: string;
}) {
  const previewValues = { ...PREVIEW_VALUES, company_name: workspaceName };
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplateItem | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<TemplateType | "all">("all");
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  const [name, setName] = useState("");
  const [type, setType] = useState<TemplateType>("general");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Ref handle exposed by RichTextEditor — lets us insert at cursor
  const editorRef = useRef<{ insertText: (text: string) => void } | null>(null);

  const isDirty =
    name.trim() !== (editing?.name ?? "") ||
    subject.trim() !== (editing?.subject ?? "") ||
    body !== (editing?.body ?? "");

  // Adjust state when sheet opens/closes (no effect — avoids cascading render)
  const syncKey = open ? (editing?.id ?? "__new__") : "__closed__";
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (open) {
      setName(editing?.name ?? "");
      setType(editing?.type ?? "general");
      setSubject(editing?.subject ?? "");
      setBody(editing?.body ?? "");
      setTab("edit");
    }
  }

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "all" || t.type === filterType;
    return matchesSearch && matchesType;
  });

  const unknownVariables = findUnknownVariables(`${subject}\n${body}`);

  function openNew(prefill?: typeof STARTER_TEMPLATES[number]) {
    setEditing(null);
    if (prefill) {
      // Force sync by using a fake editing object approach: set state directly
      setName(prefill.name);
      setType(prefill.type);
      setSubject(prefill.subject);
      setBody(prefill.body);
      setTab("edit");
      setSyncedKey("__prefill__");
    }
    setOpen(true);
  }

  function save() {
    startTransition(async () => {
      const fields = { name, type, subject, body };
      const result = editing
        ? await updateEmailTemplate({ templateId: editing.id, ...fields })
        : await createEmailTemplate(fields);

      if (!result.success) {
        toast.error(result.error ?? "Could not save the template.");
        return;
      }
      toast.success(editing ? "Template updated" : "Template created");
      setOpen(false);
      setEditing(null);
      router.refresh();
    });
  }

  function remove(template: EmailTemplateItem) {
    if (!window.confirm(`Delete the "${template.name}" template?`)) return;
    startTransition(async () => {
      const result = await deleteEmailTemplate({ templateId: template.id });
      if (!result.success) {
        toast.error(result.error ?? "Could not delete the template.");
        return;
      }
      toast.success("Template deleted");
      router.refresh();
    });
  }

  // Strip HTML tags for plain-text preview of body in cards
  function stripHtml(html: string) {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {templates.length === 0
            ? "No templates yet."
            : `${templates.length} template${templates.length === 1 ? "" : "s"}.`}
        </p>
        <Button size="sm" onClick={() => openNew()}>
          <Plus className="size-4" />
          New template
        </Button>
      </div>

      {/* Search + type filter */}
      {templates.length > 0 && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterType} onValueChange={(v) => setFilterType(v as TemplateType | "all")}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(TEMPLATE_TYPE_LABELS) as TemplateType[]).map((t) => (
                <SelectItem key={t} value={t}>{TEMPLATE_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Empty state */}
      {templates.length === 0 ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <FileText className="size-5" strokeWidth={1.6} />
            </span>
            <p className="text-sm font-medium">Write once, send often</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Start from a starter template or create your own with variables like{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{candidate_first_name}}"}</code>.
            </p>
          </div>
          {/* Starter template cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            {STARTER_TEMPLATES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => openNew(t)}
                className="group rounded-xl border border-dashed p-4 text-left transition hover:border-primary/40 hover:bg-accent/50"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", TEMPLATE_TYPE_COLORS[t.type])}>
                    {TEMPLATE_TYPE_LABELS[t.type]}
                  </span>
                </div>
                <p className="text-sm font-medium group-hover:text-primary">{t.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.subject}</p>
              </button>
            ))}
          </div>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
          <p className="text-sm text-muted-foreground">No templates match your filters.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredTemplates.map((template) => (
            <Card key={template.id}>
              <CardContent className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="truncate font-semibold">{template.name}</p>
                    <span className={cn("w-fit rounded-md px-2 py-0.5 text-[11px] font-semibold", TEMPLATE_TYPE_COLORS[template.type])}>
                      {TEMPLATE_TYPE_LABELS[template.type]}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => { setEditing(template); setOpen(true); }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${template.name}`}
                      disabled={isPending}
                      onClick={() => remove(template)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <p className="truncate text-sm font-medium text-foreground/80">{template.subject}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{stripHtml(template.body)}</p>
                <p className="text-xs text-muted-foreground">
                  Updated <RelativeTime value={template.updatedAt} />
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Editor sheet */}
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next && isDirty && !window.confirm("Discard unsaved changes?")) return;
          setOpen(next);
          if (!next) setEditing(null);
        }}
      >
        <DrawerLayout
          title={editing ? "Edit template" : "New template"}
          description="Variables are replaced per candidate when the email is sent."
          footer={
            <>
              <SheetClose asChild>
                <Button variant="outline" disabled={isPending}>Cancel</Button>
              </SheetClose>
              <Button
                onClick={save}
                disabled={isPending || !name.trim() || !subject.trim() || !body.trim()}
              >
                {isPending ? "Saving…" : "Save template"}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            {/* Name + type row */}
            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor="template-name">Name</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Interview invitation"
                />
              </div>
              <div className="w-36 space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as TemplateType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TEMPLATE_TYPE_LABELS) as TemplateType[]).map((t) => (
                      <SelectItem key={t} value={t}>{TEMPLATE_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="template-subject">Subject</Label>
              <Input
                id="template-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Next steps for {{job_title}}"
              />
            </div>

            {/* Body — edit / preview tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Body</Label>
                <div className="flex rounded-md border border-border/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setTab("edit")}
                    className={cn(
                      "rounded px-2.5 py-0.5 text-xs font-medium transition",
                      tab === "edit" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("preview")}
                    className={cn(
                      "rounded px-2.5 py-0.5 text-xs font-medium transition",
                      tab === "preview" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Preview
                  </button>
                </div>
              </div>

              {tab === "edit" ? (
                <>
                  <RichTextEditor
                    key={syncedKey ?? undefined}
                    defaultValue={body}
                    onChange={setBody}
                    editorRef={editorRef}
                    placeholder={"Hi {{candidate_first_name}},\n\nWrite your message here…"}
                    minHeight="10rem"
                  />

                  {/* Variable pills grouped */}
                  <div className="space-y-2 pt-1">
                    {VARIABLE_GROUPS.map(([group, vars]) => (
                      <div key={group}>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{group}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {vars.map((variable) => (
                            <button
                              key={variable.key}
                              type="button"
                              onClick={() => editorRef.current?.insertText(`{{${variable.key}}}`)}
                              className="cursor-pointer rounded-[6px] bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                              title={variable.label}
                            >
                              {`{{${variable.key}}}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {unknownVariables.length > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Unknown variable{unknownVariables.length > 1 ? "s" : ""}:{" "}
                      {unknownVariables.map((v) => `{{${v}}}`).join(", ")} — will be sent as-is.
                    </p>
                  )}
                </>
              ) : (
                /* Preview panel */
                <div className="rounded-xl border bg-white p-5 shadow-sm dark:bg-zinc-950">
                  {subject.trim() && (
                    <p className="mb-4 border-b border-border/50 pb-3 text-[13px] font-semibold text-foreground">
                      {interpolateTemplate(subject, previewValues)}
                    </p>
                  )}
                  {body ? (
                    <div
                      className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground/90 prose-p:my-2 prose-ul:my-2 prose-ol:my-2"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(
                          interpolateTemplate(body, previewValues),
                          { ALLOWED_TAGS: ["p","br","strong","em","s","ul","ol","li","h1","h2","blockquote","a"], ALLOWED_ATTR: ["href"] },
                        ),
                      }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
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
