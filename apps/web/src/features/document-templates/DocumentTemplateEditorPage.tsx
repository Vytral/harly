"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import DOMPurify from "dompurify";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "@/lib/notification-island/toast";
import { TEMPLATE_VARIABLES } from "@/features/email-templates/interpolate";

import { createWorkflowDocumentTemplate, updateWorkflowDocumentTemplate } from "./actions";
import type { WorkflowDocumentTemplateItem } from "./shared";

const allowedPreviewTags = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "s", "ul", "ol", "li", "h1", "h2", "blockquote", "a"],
  ALLOWED_ATTR: ["href"],
};

const LIST_HREF = "/dashboard/documents?view=templates";
const VARIABLE_GROUPS = Array.from(new Set(TEMPLATE_VARIABLES.map((item) => item.group)));

export function DocumentTemplateEditorPage({ template }: { template: WorkflowDocumentTemplateItem | null }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(template?.name ?? "");
  const [title, setTitle] = useState(template?.title ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const editorRef = useRef<{ insertText: (text: string) => void } | null>(null);
  const [saved, setSaved] = useState({ name, title, body });
  const dirty = name !== saved.name || title !== saved.title || body !== saved.body;

  const missing = [
    !name.trim() && "a library name",
    !title.trim() && "a PDF title",
    !body.trim() && "some content",
  ].filter(Boolean) as string[];

  // Closing the tab or reloading with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function leave() {
    if (
      dirty &&
      !(await confirm({
        tone: "warning",
        title: "Discard your changes?",
        description: "Edits to this template have not been saved.",
        confirmLabel: "Discard changes",
        cancelLabel: "Keep editing",
      }))
    )
      return;
    router.push(LIST_HREF as Route);
  }

  function save() {
    startTransition(async () => {
      const result = template
        ? await updateWorkflowDocumentTemplate({ templateId: template.id, name, title, body, format: "rich_text" })
        : await createWorkflowDocumentTemplate({ name, title, body, format: "rich_text" });
      if (!result.success) {
        toast.error(result.error ?? "Could not save the document template.");
        return;
      }
      toast.success(template ? "Document template updated." : "Document template created.");
      setSaved({ name, title, body });
      router.push(LIST_HREF as Route);
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-warm-paper">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-pure-snow px-5 py-4 shadow-[var(--shadow-card)] sm:px-8">
        <button
          type="button"
          onClick={() => void leave()}
          className="text-sm font-medium text-soft-ink hover:text-near-ink"
        >
          ← Documents / Templates
        </button>
        <div className="flex items-center gap-3">
          {missing.length > 0 ? (
            <p className="hidden text-xs text-soft-ink sm:block" aria-live="polite">
              Add {missing.join(", ")} to save
            </p>
          ) : dirty ? (
            <p className="hidden text-xs text-soft-ink sm:block">Unsaved changes</p>
          ) : null}
          <Button variant="ghost" onClick={() => void leave()}>
            Discard
          </Button>
          <Button disabled={pending || missing.length > 0} onClick={save}>
            {pending ? "Saving…" : "Save template"}
          </Button>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-6">
          <div>
            <h1 className="font-display text-2xl">{template ? "Edit document template" : "New document template"}</h1>
            <p className="mt-1 text-sm text-soft-ink">
              The PDF is generated the same way every time. Use it by hand from Documents or in any published workflow.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="document-template-name">Library name</Label>
              <Input
                id="document-template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Employment agreement"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="document-template-title">PDF title</Label>
              <Input
                id="document-template-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Employment agreement for {{candidate_full_name}}"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>Content</Label>
              <p className="mt-1 text-xs text-soft-ink">
                Formatting is sanitized before storage. Variables are filled in when the document is generated.
              </p>
            </div>
            <SegmentedControl
              aria-label="Editor mode"
              value={mode}
              onValueChange={setMode}
              options={[
                { value: "edit", label: "Edit" },
                { value: "preview", label: "Preview" },
              ]}
            />
          </div>
          {mode === "edit" ? (
            <RichTextEditor
              defaultValue={body}
              onChange={setBody}
              editorRef={editorRef}
              placeholder="Dear {{candidate_full_name}},"
              minHeight="30rem"
            />
          ) : (
            <article
              className="prose prose-sm min-h-[30rem] max-w-none rounded-[var(--radius-card)] bg-pure-snow p-7 shadow-[var(--shadow-card)] dark:prose-invert"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(body || "<p>Start writing your document.</p>", allowedPreviewTags),
              }}
            />
          )}
        </section>
        <aside className="h-fit rounded-[var(--radius-card)] bg-pure-snow p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-sm font-semibold">Variables</h2>
          <p className="mt-1 text-xs leading-5 text-soft-ink">
            Insert a variable at the cursor. Unknown variables block saving. Interview values stay blank in documents generated by hand.
          </p>
          <div className="mt-5 space-y-4">
            {VARIABLE_GROUPS.map((group) => (
              <div key={group}>
                <p className="mb-2 text-xs font-medium text-soft-ink">{group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.filter((item) => item.group === group).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setMode("edit");
                        editorRef.current?.insertText(`{{${item.key}}}`);
                      }}
                      className="rounded-full bg-card-inset px-2.5 py-1 font-mono text-[11px] text-near-ink hover:bg-row-wash"
                    >{`{{${item.key}}}`}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
