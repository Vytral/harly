"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  FolderCog,
  LayoutGrid,
  List,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  bulkDeleteDocuments,
  bulkSetDocumentCategory,
  bulkSetDocumentStatus,
} from "./actions";
import {
  CategoryDialog,
  StatusPill,
  UploadDialog,
  formatDate,
  iconForDocument,
  uploadToStorage,
  validateDocumentFile,
} from "./DocumentShared";
import {
  DOCUMENT_STATUS_META,
  SIGNATURE_STATUS_META,
  documentTypeLabel,
  formatDocumentSize,
  type DocumentHubData,
} from "./shared";

function Stat({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="border-l border-border/70 pl-4 first:border-l-0 first:pl-0">
      <p
        className={`font-display text-2xl font-semibold tracking-tight ${tone}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyState({
  data,
  onUpload,
}: {
  data: DocumentHubData;
  onUpload: () => void;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <FolderCog className="size-5" />
      </span>
      <p className="text-base font-semibold">
        {data.documents.length === 0
          ? "Your document library is empty"
          : "No documents match these filters"}
      </p>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">
        {data.documents.length === 0
          ? "Drag files anywhere on this page, or upload one to start building a shared, auditable source of truth for your hiring team."
          : "Try a broader search or clear one of the filters."}
      </p>
      {data.documents.length === 0 && data.canManage ? (
        <Button size="sm" className="mt-4" onClick={onUpload}>
          <Upload className="size-4" />
          Upload first document
        </Button>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="relative flex shrink-0 items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-[8.5rem] appearance-none rounded-full border border-input bg-background px-4 pr-8 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="all">{label}: All</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" />
    </label>
  );
}

export function DocumentsHub({
  data,
  initialCandidateId,
}: {
  data: DocumentHubData;
  initialCandidateId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [section, setSection] = useState<"active" | "archived">("active");
  const [signature, setSignature] = useState("all");
  const [association, setAssociation] = useState("all");
  const [candidateFilter, setCandidateFilter] = useState(initialCandidateId ?? null);
  const candidateFilterName = candidateFilter
    ? data.associationOptions.find(
        (option) => option.type === "candidate" && option.id === candidateFilter,
      )?.label ?? "this candidate"
    : null;

  function clearCandidateFilter() {
    setCandidateFilter(null);
    router.replace("/dashboard/documents" as Route);
  }
  const [uploadOpen, setUploadOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pageDragging, setPageDragging] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const dragDepth = useRef(0);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.documents.filter((document) => {
      if (document.status !== section) return false;
      if (candidateFilter && !document.candidateIds.includes(candidateFilter))
        return false;
      if (
        needle &&
        !`${document.name} ${document.originalName} ${document.ownerName ?? ""}`
          .toLowerCase()
          .includes(needle)
      )
        return false;
      if (category !== "all" && document.category?.id !== category)
        return false;
      if (signature !== "all" && document.signatureStatus !== signature)
        return false;
      if (
        association !== "all" &&
        !document.associationLabels.some(
          (label) => label.toLowerCase() === association,
        )
      )
        return false;
      return true;
    });
  }, [data.documents, query, category, section, signature, association, candidateFilter]);
  const active = data.documents.filter(
    (document) => document.status === "active",
  ).length;
  const archived = data.documents.filter(
    (document) => document.status === "archived",
  ).length;
  const pending = data.documents.filter(
    (document) => document.signatureStatus === "pending",
  ).length;
  const expired = data.documents.filter(
    (document) =>
      document.signatureStatus === "expired" ||
      (document.expiresAt && new Date(document.expiresAt) < new Date()),
  ).length;
  const assigned = data.documents.filter(
    (document) =>
      document.ownerId === data.currentUserId ||
      document.assignments.some(
        (assignment) => assignment.userId === data.currentUserId,
      ),
  ).length;

  const filteredIds = filtered.map((document) => document.id);
  const selectedInView = filteredIds.filter((id) => selectedIds.has(id));
  const allInViewSelected =
    filteredIds.length > 0 && selectedInView.length === filteredIds.length;

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds((current) => {
      if (allInViewSelected) {
        const next = new Set(current);
        for (const id of filteredIds) next.delete(id);
        return next;
      }
      return new Set([...current, ...filteredIds]);
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function uploadFiles(files: File[]) {
    if (!data.canManage || files.length === 0) return;
    const { createDocument } = await import("./actions");
    const valid: File[] = [];
    let rejected = 0;
    for (const file of files) {
      if (validateDocumentFile(file)) rejected += 1;
      else valid.push(file);
    }
    if (valid.length === 0) {
      toast.error(
        "No files could be uploaded. Use PDF, DOCX, or image files up to 25 MB.",
      );
      return;
    }
    setBulkUploading(true);
    let uploaded = 0;
    for (const file of valid) {
      try {
        const { key, checksum } = await uploadToStorage(file);
        const result = await createDocument({
          name: file.name.replace(/\.[^.]+$/, "") || file.name,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          checksum,
          storageKey: key,
          categoryId: null,
          association: { targetType: "workspace", targetId: null },
        });
        if (result.ok) uploaded += 1;
        else rejected += 1;
      } catch {
        rejected += 1;
      }
    }
    setBulkUploading(false);
    if (uploaded > 0)
      toast.success(
        `${uploaded} document${uploaded === 1 ? "" : "s"} uploaded`,
      );
    if (rejected > 0)
      toast.error(
        `${rejected} file${rejected === 1 ? "" : "s"} could not be uploaded`,
      );
    router.refresh();
  }

  function runBulk(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    void (async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "Bulk action failed.");
        return;
      }
      toast.success(result.error ?? success);
      clearSelection();
      router.refresh();
    })();
  }

  function bulkDelete() {
    if (
      !window.confirm(
        `Permanently delete ${selectedInView.length} document${selectedInView.length === 1 ? "" : "s"}? This cannot be undone.`,
      )
    )
      return;
    runBulk(
      () => bulkDeleteDocuments({ documentIds: selectedInView }),
      "Documents deleted",
    );
  }

  return (
    <div
      className="relative mx-auto max-w-[1400px] space-y-6"
      onDragEnter={(event) => {
        if (!data.canManage) return;
        event.preventDefault();
        dragDepth.current += 1;
        setPageDragging(true);
      }}
      onDragOver={(event) => {
        if (data.canManage) event.preventDefault();
      }}
      onDragLeave={() => {
        if (!data.canManage) return;
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setPageDragging(false);
        }
      }}
      onDrop={(event) => {
        if (!data.canManage) return;
        event.preventDefault();
        dragDepth.current = 0;
        setPageDragging(false);
        void uploadFiles(Array.from(event.dataTransfer.files ?? []));
      }}
    >
      {pageDragging ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-accent/40 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="size-8" />
            <p className="text-sm font-semibold">
              Drop files to upload to the workspace library
            </p>
          </div>
        </div>
      ) : null}
      <header className="flex flex-col gap-4 border-b border-border/70 pb-5 duration-500 animate-in fade-in slide-in-from-bottom-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Documents
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
            A secure home for the files that move candidates, offers, and hiring
            decisions forward.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
            <FolderCog className="size-4" />
            Categories
          </Button>
          {data.canManage ? (
            <Button
              onClick={() => setUploadOpen(true)}
              disabled={bulkUploading}
            >
              <Upload className="size-4" />
              {bulkUploading ? "Uploading…" : "Upload document"}
            </Button>
          ) : null}
        </div>
      </header>
      {candidateFilterName ? (
        <div className="flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.04] px-3 py-1.5 text-xs font-medium text-foreground">
          Showing documents for {candidateFilterName}
          <button
            type="button"
            onClick={clearCandidateFilter}
            aria-label="Clear candidate filter"
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      <section className="flex flex-wrap gap-x-8 gap-y-4 border-b border-border/70 pb-5 duration-500 animate-in fade-in slide-in-from-bottom-2">
        <Stat label="Active documents" value={active} tone="text-primary" />
        <Stat label="Archived" value={archived} />
        <Stat label="Pending signature" value={pending} tone="text-warning" />
        <Stat label="Expired" value={expired} tone="text-destructive" />
        <Stat label="Assigned to me" value={assigned} />
      </section>
      <nav className="flex gap-1 border-b border-border/70" aria-label="Document sections">
        {(["active", "archived"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-current={section === value ? "page" : undefined}
            onClick={() => { setSection(value); clearSelection(); }}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${section === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {value === "active" ? "Active documents" : "Archived"} <span className="ml-1 text-xs text-muted-foreground">{value === "active" ? active : archived}</span>
          </button>
        ))}
      </nav>
      <section className="space-y-3 duration-500 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex flex-col gap-2 lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search documents, owners, or original names"
              className="h-10 rounded-full pl-10"
            />
          </div>
          <FilterSelect
            label="Category"
            value={category}
            onChange={setCategory}
            options={data.categories
              .filter((item) => item.active)
              .map((item) => [item.id, item.name])}
          />
          <FilterSelect
            label="Signature"
            value={signature}
            onChange={setSignature}
            options={Object.entries(SIGNATURE_STATUS_META).map(
              ([key, item]) => [key, item.label],
            )}
          />
          <FilterSelect
            label="Association"
            value={association}
            onChange={setAssociation}
            options={[
              ["workspace", "Workspace"],
              ["candidate", "Candidate"],
              ["application", "Application"],
              ["offer", "Offer"],
              ["job", "Job"],
            ]}
          />
          <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-muted p-1">
            <button
              type="button"
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={`flex size-8 items-center justify-center rounded-full transition-colors ${view === "list" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              <List className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              className={`flex size-8 items-center justify-center rounded-full transition-colors ${view === "grid" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {data.documents.length} document
          {data.documents.length === 1 ? "" : "s"}
        </p>
      </section>
      {data.canManage && selectedInView.length > 0 ? (
        <section className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-accent/40 px-4 py-2.5 animate-in fade-in slide-in-from-top-1">
          <span className="text-sm font-medium">
            {selectedInView.length} selected
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={section === "archived"}
              onClick={() =>
                runBulk(
                  () =>
                    bulkSetDocumentStatus({
                      documentIds: selectedInView,
                      status: "archived",
                    }),
                  "Documents archived",
                )
              }
            >
              <Archive className="size-4" />
              Archive
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={section === "active"}
              onClick={() =>
                runBulk(
                  () =>
                    bulkSetDocumentStatus({
                      documentIds: selectedInView,
                      status: "active",
                    }),
                  "Documents restored",
                )
              }
            >
              <ArchiveRestore className="size-4" />
              Restore
            </Button>
            <label className="flex items-center gap-1.5 text-sm">
              <FolderCog className="size-4 text-muted-foreground" />
              <select
                defaultValue=""
                disabled={section === "archived"}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) return;
                  runBulk(
                    () =>
                      bulkSetDocumentCategory({
                        documentIds: selectedInView,
                        categoryId: value === "none" ? null : value,
                      }),
                    "Category updated",
                  );
                  event.target.value = "";
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="" disabled>
                  Set category…
                </option>
                <option value="none">No category</option>
                {data.categories
                  .filter((item) => item.active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            {data.canDelete ? (
              <Button size="sm" variant="destructive" onClick={bulkDelete}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="size-4" />
              Clear
            </Button>
          </div>
        </section>
      ) : null}
      {view === "list" ? (
        <section className="overflow-hidden rounded-xl border border-border/70 bg-card duration-500 animate-in fade-in slide-in-from-bottom-3">
          <div className="hidden grid-cols-[2.5rem_minmax(15rem,2fr)_7rem_9rem_9rem_8rem] gap-4 border-b bg-muted/25 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            {data.canManage ? (
              <span className="flex items-center">
                <Checkbox
                  checked={allInViewSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </span>
            ) : (
              <span />
            )}
            <span>Name</span>
            <span>Type</span>
            <span>Association</span>
            <span>Owner</span>
            <span>Updated</span>
          </div>
          {filtered.length === 0 ? (
            <EmptyState data={data} onUpload={() => setUploadOpen(true)} />
          ) : (
            <div className="divide-y divide-border/60">
              {filtered.map((document) => {
                const Icon = iconForDocument(document.mimeType);
                const statusMeta =
                  DOCUMENT_STATUS_META[document.status] ??
                  DOCUMENT_STATUS_META.active;
                const sigMeta =
                  SIGNATURE_STATUS_META[document.signatureStatus] ??
                  SIGNATURE_STATUS_META.unsigned;
                const isSelected = selectedIds.has(document.id);
                return (
                  <div
                    key={document.id}
                    className={`grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-accent/30 md:grid-cols-[2.5rem_minmax(15rem,2fr)_7rem_9rem_9rem_8rem] md:items-center md:gap-4 ${isSelected ? "bg-accent/40" : ""}`}
                  >
                    {data.canManage ? (
                      <span
                        className="flex items-center"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelected(document.id)}
                          aria-label={`Select ${document.name}`}
                        />
                      </span>
                    ) : (
                      <span className="hidden md:block" />
                    )}
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/documents/${document.id}` as Route)}
                      className="flex min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {document.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {formatDocumentSize(document.sizeBytes)} ·{" "}
                          <StatusPill className={statusMeta.className}>
                            {statusMeta.label}
                          </StatusPill>{" "}
                          <StatusPill className={sigMeta.className}>
                            {sigMeta.label}
                          </StatusPill>
                        </span>
                      </span>
                    </button>
                    <span className="hidden text-xs text-muted-foreground md:block">
                      {documentTypeLabel(document.mimeType)}
                    </span>
                    <span className="hidden truncate text-xs text-muted-foreground md:block">
                      {document.associationLabels.join(" · ")}
                    </span>
                    <span className="hidden items-center gap-2 truncate text-xs text-muted-foreground md:flex">
                      {document.ownerId ? (
                        <>
                          <UserAvatar
                            name={document.ownerName ?? "Workspace"}
                            src={document.ownerImage}
                            size="sm"
                            className="size-5 text-[9px]"
                          />
                          <span className="truncate">{document.ownerName}</span>
                        </>
                      ) : (
                        "Workspace"
                      )}
                    </span>
                    <span className="hidden text-xs text-muted-foreground md:block">
                      {formatDate(document.updatedAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : filtered.length === 0 ? (
        <section className="overflow-hidden rounded-xl border border-border/70 bg-card duration-500 animate-in fade-in slide-in-from-bottom-3">
          <EmptyState data={data} onUpload={() => setUploadOpen(true)} />
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-3 duration-500 animate-in fade-in slide-in-from-bottom-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((document) => {
            const Icon = iconForDocument(document.mimeType);
            const statusMeta =
              DOCUMENT_STATUS_META[document.status] ??
              DOCUMENT_STATUS_META.active;
            const sigMeta =
              SIGNATURE_STATUS_META[document.signatureStatus] ??
              SIGNATURE_STATUS_META.unsigned;
            const isSelected = selectedIds.has(document.id);
            return (
              <div
                key={document.id}
                className={`group relative flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 ${isSelected ? "border-primary/60 ring-1 ring-primary/30" : "border-border/70"}`}
              >
                {data.canManage ? (
                  <span
                    className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 data-[checked=true]:opacity-100"
                    data-checked={isSelected}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelected(document.id)}
                      aria-label={`Select ${document.name}`}
                    />
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/documents/${document.id}` as Route)}
                  className="flex flex-1 flex-col text-left focus-visible:outline-none"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="mt-3 line-clamp-2 text-sm font-medium">
                    {document.name}
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {documentTypeLabel(document.mimeType)} ·{" "}
                    {formatDocumentSize(document.sizeBytes)}
                  </span>
                  <span className="mt-auto flex flex-wrap gap-1.5 pt-3">
                    <StatusPill className={statusMeta.className}>
                      {statusMeta.label}
                    </StatusPill>
                    <StatusPill className={sigMeta.className}>
                      {sigMeta.label}
                    </StatusPill>
                  </span>
                </button>
              </div>
            );
          })}
        </section>
      )}
      <UploadDialog
        data={data}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />
      <CategoryDialog
        data={data}
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
      />
    </div>
  );
}
