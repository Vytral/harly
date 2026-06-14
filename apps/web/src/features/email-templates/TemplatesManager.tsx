"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createEmailTemplate,
  deleteEmailTemplate,
  updateEmailTemplate,
} from "@/features/email-templates/actions";
import type { EmailTemplateItem } from "@/features/email-templates/data";
import {
  findUnknownVariables,
  interpolateTemplate,
  TEMPLATE_VARIABLES,
} from "@/features/email-templates/interpolate";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { RelativeTime } from "@/lib/date-hydration";

const PREVIEW_VALUES = {
  candidate_first_name: "Ava",
  candidate_last_name: "Thompson",
  candidate_full_name: "Ava Thompson",
  job_title: "Senior Frontend Engineer",
  company_name: "Acme Inc.",
  sender_name: "You",
};

export function TemplatesManager({
  templates,
}: {
  templates: EmailTemplateItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplateItem | null>(null);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Sync the form to the open template at render time (React's "adjust state on
  // prop change" pattern) instead of in an effect — avoids a cascading render.
  const syncKey = open ? (editing?.id ?? "__new__") : "__closed__";
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (open) {
      setName(editing?.name ?? "");
      setSubject(editing?.subject ?? "");
      setBody(editing?.body ?? "");
    }
  }

  const unknownVariables = findUnknownVariables(`${subject}\n${body}`);

  function insertVariable(key: string) {
    setBody((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}{{${key}}}`);
  }

  function save() {
    startTransition(async () => {
      const fields = { name, subject, body };
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {templates.length === 0
            ? "No templates yet."
            : `${templates.length} template${templates.length === 1 ? "" : "s"}.`}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <FileText className="size-5" strokeWidth={1.6} />
          </span>
          <p className="text-sm font-medium">Write once, send often</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Templates support variables like{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              {"{{candidate_first_name}}"}
            </code>{" "}
            and fill themselves in when you email a candidate.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardContent className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{template.name}</p>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => {
                        setEditing(template);
                        setOpen(true);
                      }}
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
                <p className="truncate text-sm font-medium text-foreground/80">
                  {template.subject}
                </p>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {template.body}
                </p>
                <p className="text-xs text-muted-foreground">
                  Updated <RelativeTime value={template.updatedAt} />
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onOpenChange={(next) => {
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
                <Button variant="outline" disabled={isPending}>
                  Cancel
                </Button>
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
            <div className="space-y-2">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Interview invitation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-subject">Subject</Label>
              <Input
                id="template-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Next steps for {{job_title}}"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-body">Body</Label>
              <Textarea
                id="template-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={"Hi {{candidate_first_name}},\n\n…"}
                className="min-h-40"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {TEMPLATE_VARIABLES.map((variable) => (
                  <button
                    key={variable.key}
                    type="button"
                    onClick={() => insertVariable(variable.key)}
                    className="cursor-pointer rounded-[6px] bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                    title={variable.label}
                  >
                    {`{{${variable.key}}}`}
                  </button>
                ))}
              </div>
              {unknownVariables.length > 0 ? (
                <p className="text-xs text-clay">
                  Unknown variable{unknownVariables.length > 1 ? "s" : ""}:{" "}
                  {unknownVariables.map((v) => `{{${v}}}`).join(", ")} — will be
                  sent as-is.
                </p>
              ) : null}
            </div>

            {subject.trim() || body.trim() ? (
              <div className="space-y-2 rounded-xl border bg-muted/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Preview
                </p>
                <p className="text-sm font-medium">
                  {interpolateTemplate(subject, PREVIEW_VALUES)}
                </p>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {interpolateTemplate(body, PREVIEW_VALUES)}
                </p>
              </div>
            ) : null}
          </div>
        </DrawerLayout>
      </Sheet>
    </div>
  );
}
