"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import DOMPurify from "dompurify";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { toast } from "@/lib/notification-island/toast";
import { TEMPLATE_VARIABLES } from "@/features/email-templates/interpolate";

import { createWorkflowDocumentTemplate, updateWorkflowDocumentTemplate } from "./actions";
import type { WorkflowDocumentTemplateItem } from "./shared";

const allowedPreviewTags = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "s", "ul", "ol", "li", "h1", "h2", "blockquote", "a"],
  ALLOWED_ATTR: ["href"],
};

export function DocumentTemplateEditorPage({ template }: { template: WorkflowDocumentTemplateItem | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(template?.name ?? "");
  const [title, setTitle] = useState(template?.title ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const editorRef = useRef<{ insertText: (text: string) => void } | null>(null);

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
      router.push("/dashboard/documents?view=templates" as Route);
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-8">
        <Link href={"/dashboard/documents?view=templates" as Route} className="text-sm font-medium text-muted-foreground hover:text-foreground">← Documents / Workflow templates</Link>
        <div className="flex gap-2"><Button variant="ghost" asChild><Link href={"/dashboard/documents?view=templates" as Route}>Cancel</Link></Button><Button disabled={pending || !name.trim() || !title.trim() || !body.trim()} onClick={save}>{pending ? "Saving…" : "Save template"}</Button></div>
      </header>
      <main className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_22rem] sm:px-8">
        <section className="space-y-6">
          <div><h1 className="text-xl font-semibold">{template ? "Edit workflow document template" : "New workflow document template"}</h1><p className="mt-1 text-sm text-muted-foreground">The generated PDF is deterministic and can be used by any published v2 workflow.</p></div>
          <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="document-template-name">Library name</Label><Input id="document-template-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Employment agreement" /></div><div className="space-y-2"><Label htmlFor="document-template-title">PDF title</Label><Input id="document-template-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Employment agreement for {{candidate_full_name}}" /></div></div>
          <div className="flex items-center justify-between gap-3"><div><Label>Content</Label><p className="mt-1 text-xs text-muted-foreground">Formatting is sanitized before storage. Variables are resolved when the workflow runs.</p></div><div className="flex rounded-lg border bg-muted/40 p-1"><button type="button" onClick={() => setMode("edit")} className={mode === "edit" ? "rounded-md bg-background px-3 py-1.5 text-xs font-medium shadow-sm" : "rounded-md px-3 py-1.5 text-xs text-muted-foreground"}>Edit</button><button type="button" onClick={() => setMode("preview")} className={mode === "preview" ? "rounded-md bg-background px-3 py-1.5 text-xs font-medium shadow-sm" : "rounded-md px-3 py-1.5 text-xs text-muted-foreground"}>Preview</button></div></div>
          {mode === "edit" ? <RichTextEditor defaultValue={body} onChange={setBody} editorRef={editorRef} placeholder="Dear {{candidate_full_name}}," minHeight="30rem" /> : <article className="prose prose-sm min-h-[30rem] max-w-none rounded-xl border bg-background p-7 dark:prose-invert" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body || "<p>Start writing your document.</p>", allowedPreviewTags) }} />}
        </section>
        <aside className="rounded-2xl border bg-muted/20 p-5"><h2 className="text-sm font-semibold">Workflow variables</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Insert a variable at the cursor. Unknown variables block saving.</p><div className="mt-5 space-y-4">{Array.from(new Set(TEMPLATE_VARIABLES.map((item) => item.group))).map((group) => <div key={group}><p className="mb-2 text-xs font-medium text-muted-foreground">{group}</p><div className="flex flex-wrap gap-1.5">{TEMPLATE_VARIABLES.filter((item) => item.group === group).map((item) => <button key={item.key} type="button" onClick={() => { setMode("edit"); editorRef.current?.insertText(`{{${item.key}}}`); }} className="rounded-md bg-background px-2 py-1 text-[11px] font-mono ring-1 ring-border hover:bg-accent">{`{{${item.key}}}`}</button>)}</div></div>)}</div></aside>
      </main>
    </div>
  );
}
