"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Download,
  FileArchive,
  FileImage,
  FileText,
  FolderCog,
  Gavel,
  LockKeyhole,
  NotebookTabs,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidePanel } from "@/components/ui/side-panel";
import { DocxViewer } from "@/features/candidates/DocxViewer";
import { PdfViewer } from "@/features/candidates/PdfViewer";
import {
  createDocument,
  createDocumentCategory,
  createDocumentVersion,
  assignDocument,
  placeDocumentLegalHold,
  releaseDocumentLegalHold,
  renameDocument,
  saveDocumentAcl,
  saveDocumentSignature,
  setDocumentCategory,
  setDocumentStatus,
  updateDocumentCategory,
} from "./actions";
import {
  DOCUMENT_MAX_SIZE,
  DOCUMENT_STATUS_META,
  SIGNATURE_STATUS_META,
  documentTypeLabel,
  formatDocumentSize,
  isPreviewable,
  type DocumentCategoryItem,
  type DocumentHubData,
  type DocumentListItem,
} from "./shared";
import { allowedDocumentContentTypes, documentExtensionMatches } from "@/lib/storage-validation";

function iconForDocument(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType === "application/pdf" || mimeType.includes("word")) return FileText;
  return FileArchive;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatActivityType(type: string) {
  return type.replace(/^document\./, "").replaceAll("_", " ");
}

function Stat({ label, value, tone = "text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="border-l border-border/70 pl-4 first:border-l-0 first:pl-0">
      <p className={`font-display text-2xl font-semibold tracking-tight ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusPill({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}

function UploadDialog({ data, open, onOpenChange, replaceDocument = null }: { data: DocumentHubData; open: boolean; onOpenChange: (open: boolean) => void; replaceDocument?: DocumentListItem | null }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [associationType, setAssociationType] = useState<"workspace" | "candidate" | "job">("workspace");
  const [associationId, setAssociationId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setName("");
    setCategoryId("");
    setAssociationType("workspace");
    setAssociationId("");
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function chooseFile(next: File | null) {
    setError(null);
    if (!next) return;
    if (!allowedDocumentContentTypes.includes(next.type as (typeof allowedDocumentContentTypes)[number])) {
      setError("Choose a PDF, DOC, DOCX, PNG, JPG, GIF, or WEBP file.");
      return;
    }
    if (next.size <= 0 || next.size > DOCUMENT_MAX_SIZE) {
      setError("Documents must be between 1 byte and 25 MB.");
      return;
    }
    if (!documentExtensionMatches(next.name, next.type)) {
      setError("The file extension does not match its content type.");
      return;
    }
    setFile(next);
    setName(next.name.replace(/\.[^.]+$/, ""));
  }

  function submit() {
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    startTransition(async () => {
      try {
        const buffer = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        const checksum = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
        const presignResponse = await fetch("/api/documents/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type, contentLength: file.size }),
        });
        const presign = (await presignResponse.json()) as { uploadUrl?: string; key?: string };
        if (!presignResponse.ok || !presign.uploadUrl || !presign.key) throw new Error("Could not prepare the document upload.");
        const upload = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!upload.ok) throw new Error("Could not upload the document.");
        const result = replaceDocument
          ? await createDocumentVersion({ documentId: replaceDocument.id, originalName: file.name, mimeType: file.type, sizeBytes: file.size, checksum, storageKey: presign.key })
          : await createDocument({
              name: name.trim() || file.name,
              originalName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              checksum,
              storageKey: presign.key,
              categoryId: categoryId || null,
              association: { targetType: associationType, targetId: associationType === "workspace" ? null : associationId || null },
            });
        if (!result.ok) throw new Error(result.error ?? "Could not save the document.");
        toast.success(replaceDocument ? "New version uploaded" : "Document uploaded");
        reset();
        onOpenChange(false);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not upload the document.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) reset(); onOpenChange(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>Keep contracts, credentials, and hiring files in one workspace-scoped vault.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="document-file">File</Label>
            <input ref={fileInput} id="document-file" type="file" className="sr-only" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => fileInput.current?.click()} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border/90 bg-muted/20 px-4 py-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Upload className="size-4" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{file?.name ?? "Choose a file"}</span><span className="mt-0.5 block text-xs text-muted-foreground">PDF, DOCX, or image · up to 25 MB</span></span>
            </button>
          </div>
          <div className="space-y-2"><Label htmlFor="document-name">Display name</Label><Input id="document-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Offer letter — Taylor Okafor" /></div>
          <div className="space-y-2"><Label htmlFor="document-category">Category</Label><select id="document-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">No category</option>{data.categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="document-association">Associate with</Label><select id="document-association" value={associationType} onChange={(event) => { const next = event.target.value as "workspace" | "candidate" | "job"; setAssociationType(next); setAssociationId(""); }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="workspace">Workspace library</option><option value="candidate">Candidate</option><option value="job">Job</option></select></div>
          {associationType !== "workspace" ? <div className="space-y-2"><Label htmlFor="document-association-target">Choose {associationType}</Label><select id="document-association-target" value={associationId} onChange={(event) => setAssociationId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select a {associationType}</option>{data.associationOptions.filter((option) => option.type === associationType).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div> : null}
          {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
        </div>
        <DialogFooter><Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={isPending}>{isPending ? "Uploading…" : "Upload document"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({ data, open, onOpenChange }: { data: DocumentHubData; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  function addCategory() {
    setError(null);
    startTransition(async () => {
      const result = await createDocumentCategory({ name });
      if (!result.ok) { setError(result.error ?? "Could not create category."); return; }
      setName(""); toast.success("Category created"); router.refresh();
    });
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Document categories</DialogTitle><DialogDescription>Use a small, consistent vocabulary so filters stay useful as the workspace grows.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="flex gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Employment agreement" /><Button onClick={addCategory} disabled={isPending || !name.trim()}><Plus className="size-4" />Add</Button></div>{error ? <p className="text-sm text-destructive">{error}</p> : null}<div className="divide-y rounded-lg border">{data.categories.length === 0 ? <p className="px-3 py-5 text-center text-sm text-muted-foreground">No custom categories yet.</p> : data.categories.map((category) => <CategoryRow key={category.id} category={category} />)}</div></div></DialogContent></Dialog>;
}

function CategoryRow({ category }: { category: DocumentCategoryItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  function save() { startTransition(async () => { const result = await updateDocumentCategory({ categoryId: category.id, name, accent: category.accent, active: category.active }); if (!result.ok) toast.error(result.error ?? "Could not update category."); else { setEditing(false); router.refresh(); } }); }
  return <div className="flex items-center gap-3 px-3 py-2.5"><span className="size-2.5 rounded-full bg-primary" />{editing ? <Input value={name} onChange={(event) => setName(event.target.value)} className="h-8" /> : <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>}<StatusPill className={category.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}>{category.active ? "Active" : "Hidden"}</StatusPill>{editing ? <Button size="sm" onClick={save} disabled={isPending}>Save</Button> : <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}</div>;
}

function AccessDialog({ data, document, open, onOpenChange }: { data: DocumentHubData; document: DocumentListItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [roles, setRoles] = useState<Array<{ roleKey: string; accessLevel: "read" | "manage" }>>(() => document.accessRoles);
  const [members, setMembers] = useState<Array<{ userId: string; accessLevel: "read" | "manage" }>>(() => document.accessMembers);
  const [isPending, startTransition] = useTransition();
  function toggleRole(roleKey: string) { setRoles((current) => current.some((rule) => rule.roleKey === roleKey) ? current.filter((rule) => rule.roleKey !== roleKey) : [...current, { roleKey, accessLevel: "read" }]); }
  function toggleMember(userId: string) { setMembers((current) => current.some((rule) => rule.userId === userId) ? current.filter((rule) => rule.userId !== userId) : [...current, { userId, accessLevel: "read" }]); }
  function save() { startTransition(async () => { const result = await saveDocumentAcl({ documentId: document!.id, roles, members }); if (!result.ok) { toast.error(result.error ?? "Could not update access."); return; } toast.success("Access updated"); onOpenChange(false); router.refresh(); }); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Manage access</DialogTitle><DialogDescription>{document.name}. Members need both the global Documents permission and an ACL match.</DialogDescription></DialogHeader><div className="max-h-[55vh] space-y-5 overflow-y-auto py-2"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roles</p><div className="space-y-1 rounded-lg border">{[...new Set(data.members.map((member) => member.role))].map((role) => { const checked = roles.some((rule) => rule.roleKey === role); return <label key={role} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/40"><input type="checkbox" checked={checked} onChange={() => toggleRole(role)} />{role.replace(/[-_]/g, " ")}</label>; })}</div></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Specific members</p><div className="space-y-1 rounded-lg border">{data.members.map((member) => { const checked = members.some((rule) => rule.userId === member.id); return <label key={member.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/40"><input type="checkbox" checked={checked} onChange={() => toggleMember(member.id)} /><span className="min-w-0 flex-1 truncate">{member.name}</span><span className="text-xs text-muted-foreground">{member.role}</span></label>; })}</div></div><p className="text-xs leading-5 text-muted-foreground">If no roles or members are selected, the document follows the workspace-level Documents permission. Once a rule is added, only matching users can open it.</p></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={isPending}>{isPending ? "Saving…" : "Save access"}</Button></DialogFooter></DialogContent></Dialog>;
}

function DocumentPreview({ document }: { document: DocumentListItem }) {
  const url = `/api/documents/${document.id}`;
  if (document.mimeType === "application/pdf") return <PdfViewer fileUrl={url} fileName={document.name} className="min-h-[58vh]" />;
  if (document.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return <DocxViewer fileUrl={url} className="min-h-[58vh]" />;
  if (document.mimeType.startsWith("image/")) return <div className="flex min-h-[58vh] items-center justify-center rounded-lg border bg-muted/20 p-4"><img src={url} alt={document.name} className="max-h-[58vh] max-w-full rounded-md object-contain" /></div>;
  return <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Preview is not available for this file type.</div>;
}

function DocumentDetailsBody({ data, document }: { data: DocumentHubData; document: DocumentListItem }) {
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [nextName, setNextName] = useState(document.name);
  const [isPending, startTransition] = useTransition();
  const status = DOCUMENT_STATUS_META[document.status] ?? DOCUMENT_STATUS_META.active;
  const signature = SIGNATURE_STATUS_META[document.signatureStatus] ?? SIGNATURE_STATUS_META.unsigned;
  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) { startTransition(async () => { const result = await action(); if (!result.ok) { toast.error(result.error ?? "Could not update document."); return; } toast.success(success); router.refresh(); }); }
  function rename() { run(() => renameDocument({ documentId: document.id, name: nextName }), "Name updated"); setRenameOpen(false); }
  const assignmentFor = (assignmentType: "owner" | "reviewer") => document.assignments.find((assignment) => assignment.assignmentType === assignmentType)?.userId ?? "";
  const saveSignatureStatus = (nextStatus: keyof typeof SIGNATURE_STATUS_META) => run(() => saveDocumentSignature({ documentId: document.id, status: nextStatus, provider: document.signatureProvider, envelopeId: document.signatureEnvelopeId, url: document.signatureUrl, expiresAt: document.expiresAt }), "Signature status updated");
  return <><div className="space-y-6"><div><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" /></span><div className="min-w-0 flex-1"><h2 className="break-words text-base font-semibold leading-6">{document.name}</h2><p className="mt-1 text-xs text-muted-foreground">{documentTypeLabel(document.mimeType)} · {formatDocumentSize(document.sizeBytes)} · v{document.currentVersion}</p></div></div><div className="mt-4 flex flex-wrap gap-1.5"><StatusPill className={status.className}>{status.label}</StatusPill><StatusPill className={signature.className}>{signature.label}</StatusPill>{document.category ? <StatusPill className="bg-muted text-muted-foreground">{document.category.name}</StatusPill> : null}</div></div><div className="grid grid-cols-2 gap-x-4 gap-y-4 border-y py-4 text-sm"><div><p className="text-xs text-muted-foreground">Association</p><p className="mt-1 font-medium">{document.associationLabels.join(" · ")}</p></div><div><p className="text-xs text-muted-foreground">Owner</p><p className="mt-1 font-medium">{document.ownerName ?? "Workspace"}</p></div><div><p className="text-xs text-muted-foreground">Updated</p><p className="mt-1 font-medium">{formatDate(document.updatedAt)}</p></div><div><p className="text-xs text-muted-foreground">Versions</p><p className="mt-1 font-medium">{document.versionCount}</p></div><div><p className="text-xs text-muted-foreground">Checksum</p><p className="mt-1 truncate font-mono text-[11px]" title={document.checksum}>{document.checksum.slice(0, 12)}…</p></div></div><div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</p><div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" disabled={!isPreviewable(document.mimeType)} onClick={() => setPreviewOpen(true)}><FileText className="size-4" />Preview</Button><Button size="sm" variant="outline" asChild><a href={`/api/documents/${document.id}?download=1`}><Download className="size-4" />Download</a></Button>{data.canManage ? <Button size="sm" variant="outline" onClick={() => setRenameOpen(true)}><FileText className="size-4" />Rename</Button> : null}{data.canManage ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => setDocumentStatus({ documentId: document.id, status: document.status === "archived" ? "active" : "archived" }), document.status === "archived" ? "Document restored" : "Document archived")}>{document.status === "archived" ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}{document.status === "archived" ? "Restore" : "Archive"}</Button> : null}{data.canManage ? <Button size="sm" variant="outline" disabled={isPending || document.signatureStatus === "signed" || document.signatureStatus === "pending"} onClick={() => setVersionOpen(true)}>New version</Button> : null}</div></div><div className="space-y-2"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</p><FolderCog className="size-4 text-muted-foreground" /></div><select value={document.category?.id ?? ""} disabled={!data.canManage} onChange={(event) => run(() => setDocumentCategory({ documentId: document.id, categoryId: event.target.value || null }), "Category updated")} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">No category</option>{data.categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div className="space-y-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assignments</p>{(["owner", "reviewer"] as const).map((assignmentType) => <label key={assignmentType} className="block space-y-1.5"><span className="text-sm font-medium">{assignmentType === "owner" ? "Responsible" : "Reviewer"}</span><select value={assignmentFor(assignmentType)} disabled={!data.canManage || isPending} onChange={(event) => run(() => assignDocument({ documentId: document.id, userId: event.target.value || null, assignmentType }), `${assignmentType === "owner" ? "Responsible" : "Reviewer"} updated`)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Not assigned</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>)}</div><div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Access & ownership</p><div className="rounded-lg border bg-muted/20 p-3 text-sm"><p className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" />{document.accessRoles.length + document.accessMembers.length === 0 ? "Workspace permission" : `${document.accessRoles.length + document.accessMembers.length} explicit rule${document.accessRoles.length + document.accessMembers.length === 1 ? "" : "s"}`}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Owner and workspace admins retain access. ACL rules can narrow access for everyone else.</p></div>{data.canShare ? <Button size="sm" variant="outline" className="w-full" onClick={() => setAccessOpen(true)}><Users className="size-4" />Manage access</Button> : null}</div><div className="space-y-2"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signature</p><LockKeyhole className="size-4 text-muted-foreground" /></div><select value={document.signatureStatus} disabled={!data.canManage || isPending} onChange={(event) => saveSignatureStatus(event.target.value as keyof typeof SIGNATURE_STATUS_META)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{Object.entries(SIGNATURE_STATUS_META).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select><div className="rounded-lg border p-3 text-sm"><p className="flex items-center gap-2"><LockKeyhole className="size-4 text-muted-foreground" />{signature.label}</p>{document.signatureProvider ? <p className="mt-1 text-xs text-muted-foreground">{document.signatureProvider}{document.signatureEnvelopeId ? ` · ${document.signatureEnvelopeId}` : ""}</p> : null}{document.signatureUrl ? <a href={document.signatureUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-primary underline-offset-2 hover:underline">Open DocuSign envelope</a> : null}</div></div>{document.activity.length > 0 ? <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</p><div className="divide-y rounded-lg border">{document.activity.map((event) => <div key={event.id} className="px-3 py-2.5 text-sm"><p className="capitalize">{formatActivityType(event.type)}</p><p className="mt-0.5 text-xs text-muted-foreground">{event.actorName ?? "System"} · {formatDate(event.createdAt)}</p></div>)}</div></div> : null}</div><SidePanel open={previewOpen} onOpenChange={setPreviewOpen} title={document.name} description="Secure preview"><DocumentPreview document={document} /></SidePanel><Dialog open={renameOpen} onOpenChange={setRenameOpen}><DialogContent><DialogHeader><DialogTitle>Rename document</DialogTitle><DialogDescription>This changes metadata only. The stored file and checksum stay the same.</DialogDescription></DialogHeader><Input value={nextName} onChange={(event) => setNextName(event.target.value)} /><DialogFooter><Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button><Button onClick={rename} disabled={!nextName.trim() || isPending}>Save name</Button></DialogFooter></DialogContent></Dialog><AccessDialog data={data} document={document} open={accessOpen} onOpenChange={setAccessOpen} /><UploadDialog data={data} open={versionOpen} onOpenChange={setVersionOpen} replaceDocument={document} /></>;
}

function LegalHoldDialog({
  document,
  open,
  onOpenChange,
  activeHold,
}: {
  document: DocumentListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeHold: DocumentListItem["legalHolds"][number] | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [isPending, startTransition] = useTransition();
  const releasing = Boolean(activeHold);

  function submit() {
    startTransition(async () => {
      const result = releasing
        ? await releaseDocumentLegalHold({ holdId: activeHold!.id, releaseReason: reason })
        : await placeDocumentLegalHold({ documentId: document.id, reason, reference: reference || null });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update legal hold.");
        return;
      }
      toast.success(releasing ? "Legal hold released" : "Legal hold placed");
      setReason("");
      setReference("");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{releasing ? "Release legal hold" : "Place legal hold"}</DialogTitle>
          <DialogDescription>
            {releasing
              ? "Record why this hold is being released. Other active holds, if any, remain in force."
              : "This protects the document from archival until every active hold is released."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="legal-hold-reason">{releasing ? "Release reason" : "Reason"}</Label>
            <textarea id="legal-hold-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder={releasing ? "Investigation closed…" : "Active litigation, audit, or preservation notice…"} />
          </div>
          {!releasing ? <div className="space-y-2"><Label htmlFor="legal-hold-reference">Reference (optional)</Label><Input id="legal-hold-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Matter, ticket, or case reference" /></div> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={isPending || reason.trim().length < 3}>{isPending ? "Saving…" : releasing ? "Release hold" : "Place hold"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentGovernance({ data, document }: { data: DocumentHubData; document: DocumentListItem }) {
  const [holdOpen, setHoldOpen] = useState(false);
  const activeHolds = document.legalHolds.filter((hold) => !hold.releasedAt);
  const activeHold = activeHolds[0] ?? null;
  return (
    <div className="mt-6 space-y-3 border-t pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Gavel className="size-4" />Governance</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Preservation notices and signed evidence remain workspace-scoped and ACL-protected.</p>
        </div>
        {activeHolds.length > 0 ? <StatusPill className="bg-amber-500/10 text-amber-700">{activeHolds.length} active hold{activeHolds.length === 1 ? "" : "s"}</StatusPill> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="sm" variant="outline" asChild><a href={`/api/documents/${document.id}/evidence`}><Download className="size-4" />Export evidence</a></Button>
        {data.canManage ? <Button size="sm" variant="outline" onClick={() => setHoldOpen(true)}><Gavel className="size-4" />{activeHold ? "Release legal hold" : "Place legal hold"}</Button> : null}
      </div>
      {activeHolds.length > 0 ? <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3 text-sm"><p className="font-medium text-amber-800">This document is preserved.</p>{activeHolds.map((hold) => <div key={hold.id} className="border-t border-amber-500/20 pt-2 text-xs leading-5 text-amber-900/80"><p>{hold.reason}</p>{hold.reference ? <p className="mt-0.5">Reference: {hold.reference}</p> : null}</div>)}</div> : null}
      <LegalHoldDialog document={document} activeHold={activeHold} open={holdOpen} onOpenChange={setHoldOpen} />
    </div>
  );
}

function DocumentDetails({ data, document }: { data: DocumentHubData; document: DocumentListItem }) {
  return <><DocumentDetailsBody data={data} document={document} /><DocumentGovernance data={data} document={document} /></>;
}

export function DocumentsHub({ data }: { data: DocumentHubData }) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [signature, setSignature] = useState("all");
  const [association, setAssociation] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("documentId"));
  const [uploadOpen, setUploadOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const selected = data.documents.find((document) => document.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.documents.filter((document) => {
      if (needle && !`${document.name} ${document.originalName} ${document.ownerName ?? ""}`.toLowerCase().includes(needle)) return false;
      if (category !== "all" && document.category?.id !== category) return false;
      if (status !== "all" && document.status !== status) return false;
      if (signature !== "all" && document.signatureStatus !== signature) return false;
      if (association !== "all" && !document.associationLabels.some((label) => label.toLowerCase() === association)) return false;
      return true;
    });
  }, [data.documents, query, category, status, signature, association]);
  const active = data.documents.filter((document) => document.status === "active").length;
  const pending = data.documents.filter((document) => document.signatureStatus === "pending").length;
  const expired = data.documents.filter((document) => document.signatureStatus === "expired" || (document.expiresAt && new Date(document.expiresAt) < new Date())).length;
  const assigned = data.documents.filter((document) => document.ownerId === data.currentUserId || document.assignments.some((assignment) => assignment.userId === data.currentUserId)).length;
  return <div className="mx-auto max-w-[1400px] space-y-6"><header className="flex flex-col gap-4 border-b border-border/70 pb-5 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary"><NotebookTabs className="size-4" />Workspace library</div><h1 className="font-display text-2xl font-semibold tracking-tight">Documents</h1><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">A secure home for the files that move candidates, offers, and hiring decisions forward.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setCategoriesOpen(true)}><FolderCog className="size-4" />Categories</Button>{data.canManage ? <Button onClick={() => setUploadOpen(true)}><Upload className="size-4" />Upload document</Button> : null}</div></header><section className="flex flex-wrap gap-x-8 gap-y-4 border-b border-border/70 pb-5"><Stat label="Active documents" value={active} tone="text-primary" /><Stat label="Pending signature" value={pending} tone="text-amber-700" /><Stat label="Expired" value={expired} tone="text-destructive" /><Stat label="Assigned to me" value={assigned} /></section><section className="space-y-3"><div className="flex flex-col gap-2 lg:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents, owners, or original names" className="pl-9" /></div><FilterSelect label="Category" value={category} onChange={setCategory} options={data.categories.filter((item) => item.active).map((item) => [item.id, item.name])} /><FilterSelect label="Status" value={status} onChange={setStatus} options={[["active", "Active"], ["archived", "Archived"]]} /><FilterSelect label="Signature" value={signature} onChange={setSignature} options={Object.entries(SIGNATURE_STATUS_META).map(([key, item]) => [key, item.label])} /><FilterSelect label="Association" value={association} onChange={setAssociation} options={[["workspace", "Workspace"], ["candidate", "Candidate"], ["application", "Application"], ["offer", "Offer"], ["job", "Job"]]} /></div><p className="text-xs text-muted-foreground">{filtered.length} of {data.documents.length} document{data.documents.length === 1 ? "" : "s"}</p></section><section className="overflow-hidden rounded-xl border border-border/70 bg-card"><div className="hidden grid-cols-[minmax(15rem,2fr)_7rem_9rem_9rem_8rem] gap-4 border-b bg-muted/25 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid"><span>Name</span><span>Type</span><span>Association</span><span>Owner</span><span>Updated</span></div>{filtered.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 py-14 text-center"><span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><NotebookTabs className="size-5" /></span><p className="text-sm font-semibold">{data.documents.length === 0 ? "Your document library is empty" : "No documents match these filters"}</p><p className="max-w-sm text-sm leading-6 text-muted-foreground">{data.documents.length === 0 ? "Upload a document to start building a shared, auditable source of truth for your hiring team." : "Try a broader search or clear one of the filters."}</p>{data.documents.length === 0 && data.canManage ? <Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="size-4" />Upload first document</Button> : null}</div> : <div className="divide-y divide-border/60">{filtered.map((document) => { const Icon = iconForDocument(document.mimeType); const statusMeta = DOCUMENT_STATUS_META[document.status] ?? DOCUMENT_STATUS_META.active; const sigMeta = SIGNATURE_STATUS_META[document.signatureStatus] ?? SIGNATURE_STATUS_META.unsigned; return <button key={document.id} type="button" onClick={() => setSelectedId(document.id)} className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(15rem,2fr)_7rem_9rem_9rem_8rem] md:items-center md:gap-4"><span className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{document.name}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{formatDocumentSize(document.sizeBytes)} · <StatusPill className={statusMeta.className}>{statusMeta.label}</StatusPill> <StatusPill className={sigMeta.className}>{sigMeta.label}</StatusPill></span></span></span><span className="hidden text-xs text-muted-foreground md:block">{documentTypeLabel(document.mimeType)}</span><span className="hidden truncate text-xs text-muted-foreground md:block">{document.associationLabels.join(" · ")}</span><span className="hidden truncate text-xs text-muted-foreground md:block">{document.ownerName ?? "Workspace"}</span><span className="hidden text-xs text-muted-foreground md:block">{formatDate(document.updatedAt)}</span></button>; })}</div>}</section><UploadDialog data={data} open={uploadOpen} onOpenChange={setUploadOpen} /><CategoryDialog data={data} open={categoriesOpen} onOpenChange={setCategoriesOpen} />{selected ? <SidePanel open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }} title="Document details" description="Metadata, access, and signing state"><DocumentDetails data={data} document={selected} /></SidePanel> : null}</div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="relative flex shrink-0 items-center"><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 min-w-[8.5rem] appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"><option value="all">{label}: All</option>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" /></label>;
}
