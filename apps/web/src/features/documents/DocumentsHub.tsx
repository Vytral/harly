"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  FileText,
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
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DropOverlay } from "@/components/ui/drop-zone";
import { FilterPill } from "@/components/ui/FilterPill";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import { DocumentsWorkspaceTabs } from "./DocumentsWorkspaceTabs";
import {
  bulkDeleteDocuments,
  bulkSetDocumentCategory,
  bulkSetDocumentStatus,
} from "./actions";
import {
  CategoryDialog,
  UploadDialog,
  formatDate,
  iconForDocument,
  uploadToStorage,
  validateDocumentFile,
} from "./DocumentShared";
import { GenerateDocumentDialog } from "./GenerateDocumentDialog";
import {
  DOCUMENT_LIST_GRID,
  SIGNATURE_STATUS_META,
  describeExpiry,
  documentStateMeta,
  documentTypeLabel,
  formatDocumentSize,
  type DocumentHubData,
  type DocumentListItem,
} from "./shared";

/** Which slice of the library the stat tiles are filtering to. */
export type HubFocus = "active" | "pending" | "expiring" | "lapsed" | "archived";
type SortKey = "updated" | "name" | "expires";
type SortDir = "asc" | "desc";
type Linked = { type: "candidate" | "job"; id: string } | null;

export type DocumentsHubFilters = {
  candidateId?: string;
  jobId?: string;
  focus?: string;
  q?: string;
  category?: string;
  signature?: string;
  mine?: string;
  sort?: string;
};

const DAY = 86_400_000;
const FOCUSES: HubFocus[] = ["active", "pending", "expiring", "lapsed", "archived"];
const SORT_LABELS: Record<string, string> = {
  "updated:desc": "Recently updated",
  "updated:asc": "Oldest update",
  "name:asc": "Name A to Z",
  "name:desc": "Name Z to A",
  "expires:asc": "Expires soonest",
};

const TONE_TO_PILL = {
  neutral: "neutral",
  success: "success",
  warning: "warning",
  danger: "danger",
} as const;

function matchesFocus(document: DocumentListItem, focus: HubFocus, now: number) {
  if (focus === "archived") return document.status === "archived";
  if (document.status !== "active") return false;
  if (focus === "active") return true;
  if (focus === "pending") return document.signatureStatus === "pending";
  const expires = document.expiresAt ? new Date(document.expiresAt).getTime() : null;
  if (expires === null) return false;
  if (focus === "expiring") return expires >= now && expires <= now + 30 * DAY;
  // A completed contract past its date is history, not something to chase.
  return expires < now && document.signatureStatus !== "signed";
}

function StateCell({ document }: { document: DocumentListItem }) {
  const state = documentStateMeta(document);
  return (
    <StatusPill size="sm" tone={TONE_TO_PILL[state.tone]}>
      {state.label}
    </StatusPill>
  );
}

function ExpiresCell({ document }: { document: DocumentListItem }) {
  const hint = describeExpiry(document.expiresAt);
  if (!document.expiresAt || !hint) return <span className="text-quiet-mist">No date</span>;
  return (
    <span
      className={cn(
        hint.tone === "danger" && document.signatureStatus !== "signed" && "text-danger-rust",
        hint.tone === "warning" && "text-warning-clay",
      )}
      title={hint.days < 0 ? `Passed ${hint.label}` : `Expires ${hint.label}`}
    >
      {formatDate(document.expiresAt)}
    </span>
  );
}

function OwnerCell({ document }: { document: DocumentListItem }) {
  return document.ownerId ? (
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
    <span>Workspace</span>
  );
}

function EmptyState({
  data,
  filtered,
  onUpload,
  onGenerate,
  onClear,
}: {
  data: DocumentHubData;
  filtered: boolean;
  onUpload: () => void;
  onGenerate: () => void;
  onClear: () => void;
}) {
  const empty = data.documents.length === 0;
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-[var(--radius-btn)] bg-lime-wash text-sage-ink">
        <FolderCog className="size-5" />
      </span>
      <p className="text-[15px] font-semibold text-near-ink">
        {empty ? "Your document library is empty" : "No documents match these filters"}
      </p>
      <p className="max-w-sm text-sm leading-6 text-soft-ink">
        {empty
          ? "Drag files anywhere on this page, upload one, or generate an offer letter or agreement from a template."
          : "Try a broader search or clear the filters."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {empty && data.canManage ? (
          <>
            <Button size="sm" onClick={onUpload}>
              <Upload className="size-4" />
              Upload first document
            </Button>
            <Button size="sm" variant="outline" onClick={onGenerate}>
              <FileText className="size-4" />
              Generate from template
            </Button>
          </>
        ) : null}
        {!empty && filtered ? (
          <Button size="sm" variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Searchable "linked to" picker over candidates and jobs. */
function LinkedPicker({
  options,
  value,
  onChange,
}: {
  options: DocumentHubData["associationOptions"];
  value: Linked;
  onChange: (next: Linked) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = value
    ? options.find((option) => option.type === value.type && option.id === value.id)
    : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filter by linked candidate or job"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border border-transparent bg-soft-kraft px-3.5 text-[13px] outline-none hover:bg-row-wash focus-visible:ring-[3px] focus-visible:ring-near-ink/20",
            value && "bg-sage-wash",
          )}
        >
          <span className="text-soft-ink">Linked to</span>
          <span className="max-w-32 truncate font-medium text-near-ink">
            {current?.label ?? (value ? "Selected" : "Anyone")}
          </span>
          <ChevronsUpDown className="size-3.5 text-quiet-mist" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search candidates and jobs" />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            {value ? (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <X className="size-4" />
                  Clear selection
                </CommandItem>
              </CommandGroup>
            ) : null}
            {(["candidate", "job"] as const).map((type) => (
              <CommandGroup key={type} heading={type === "candidate" ? "Candidates" : "Jobs"}>
                {options
                  .filter((option) => option.type === type)
                  .map((option) => (
                    <CommandItem
                      key={option.id}
                      value={`${type} ${option.label} ${option.id}`}
                      onSelect={() => {
                        onChange({ type, id: option.id });
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {value?.id === option.id ? <Check className="size-4" /> : null}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className="inline-flex items-center gap-1 text-left uppercase outline-none hover:text-near-ink focus-visible:text-near-ink"
    >
      {label}
      {active ? dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
    </button>
  );
}

export function DocumentsHub({
  data,
  initialFilters = {},
  canManageTemplates = false,
}: {
  data: DocumentHubData;
  initialFilters?: DocumentsHubFilters;
  canManageTemplates?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [query, setQuery] = useState(initialFilters.q ?? "");
  const [category, setCategory] = useState(initialFilters.category ?? "all");
  const [focus, setFocus] = useState<HubFocus>(
    FOCUSES.includes(initialFilters.focus as HubFocus) ? (initialFilters.focus as HubFocus) : "active",
  );
  const [signature, setSignature] = useState(
    initialFilters.signature && initialFilters.signature in SIGNATURE_STATUS_META ? initialFilters.signature : "all",
  );
  const [mine, setMine] = useState(initialFilters.mine === "1");
  const [linked, setLinked] = useState<Linked>(
    initialFilters.candidateId
      ? { type: "candidate", id: initialFilters.candidateId }
      : initialFilters.jobId
        ? { type: "job", id: initialFilters.jobId }
        : null,
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>(() => {
    const [key, dir] = (initialFilters.sort ?? "").split(":");
    return key === "name" || key === "expires" || key === "updated"
      ? { key, dir: dir === "asc" ? "asc" : "desc" }
      : { key: "updated", dir: "desc" };
  });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pageDragging, setPageDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const dragDepth = useRef(0);

  const linkedName = linked
    ? data.associationOptions.find((option) => option.type === linked.type && option.id === linked.id)?.label ?? null
    : null;

  // Keep the filters in the URL (shareable, survives refresh) without a server round trip.
  function syncUrl(next: {
    focus: HubFocus; q: string; category: string; signature: string; mine: boolean; linked: Linked; sort: { key: SortKey; dir: SortDir };
  }) {
    const params = new URLSearchParams();
    if (next.focus !== "active") params.set("focus", next.focus);
    if (next.q.trim()) params.set("q", next.q.trim());
    if (next.category !== "all") params.set("category", next.category);
    if (next.signature !== "all") params.set("signature", next.signature);
    if (next.mine) params.set("mine", "1");
    if (next.linked) params.set(next.linked.type === "candidate" ? "candidateId" : "jobId", next.linked.id);
    if (next.sort.key !== "updated" || next.sort.dir !== "desc") params.set("sort", `${next.sort.key}:${next.sort.dir}`);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }
  const current = { focus, q: query, category, signature, mine, linked, sort };
  function update<K extends keyof typeof current>(key: K, value: (typeof current)[K]) {
    syncUrl({ ...current, [key]: value });
  }

  const now = useMemo(() => Date.now(), []);
  const counts = useMemo(() => {
    const result = {} as Record<HubFocus, number>;
    for (const key of FOCUSES) result[key] = data.documents.filter((d) => matchesFocus(d, key, now)).length;
    return result;
  }, [data.documents, now]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = data.documents.filter((document) => {
      if (!matchesFocus(document, focus, now)) return false;
      if (linked) {
        const ids = linked.type === "candidate" ? document.candidateIds : document.jobIds;
        if (!ids.includes(linked.id)) return false;
      }
      if (
        needle &&
        !`${document.name} ${document.originalName} ${document.ownerName ?? ""} ${document.associationLabels.join(" ")}`
          .toLowerCase()
          .includes(needle)
      )
        return false;
      if (category !== "all" && document.category?.id !== category) return false;
      if (signature !== "all" && document.signatureStatus !== signature) return false;
      if (
        mine &&
        document.ownerId !== data.currentUserId &&
        !document.assignments.some((assignment) => assignment.userId === data.currentUserId)
      )
        return false;
      return true;
    });
    const sign = sort.dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name) * sign;
      if (sort.key === "expires") {
        // Documents without a date always sink to the bottom.
        if (!a.expiresAt && !b.expiresAt) return 0;
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return (new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()) * sign;
      }
      return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * sign;
    });
  }, [data.documents, data.currentUserId, query, category, focus, signature, mine, linked, sort, now]);

  const filtersActive =
    query.trim() !== "" || category !== "all" || signature !== "all" || mine || linked !== null || focus !== "active";
  function clearFilters() {
    setQuery("");
    setCategory("all");
    setSignature("all");
    setMine(false);
    setLinked(null);
    setFocus("active");
    syncUrl({ focus: "active", q: "", category: "all", signature: "all", mine: false, linked: null, sort });
  }

  const filteredIds = filtered.map((document) => document.id);
  const selectedDocs = filtered.filter((document) => selectedIds.has(document.id));
  const selectedInView = selectedDocs.map((document) => document.id);
  const allInViewSelected = filteredIds.length > 0 && selectedInView.length === filteredIds.length;
  const heldSelected = selectedDocs.filter((document) => document.legalHolds.some((hold) => !hold.releasedAt));
  const archivableIds = selectedDocs
    .filter((document) => !heldSelected.includes(document))
    .map((document) => document.id);

  function toggleSelected(id: string) {
    setSelectedIds((currentIds) => {
      const next = new Set(currentIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds((currentIds) => {
      if (allInViewSelected) {
        const next = new Set(currentIds);
        for (const id of filteredIds) next.delete(id);
        return next;
      }
      return new Set([...currentIds, ...filteredIds]);
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }
  function onSort(key: SortKey) {
    const next = { key, dir: sort.key === key && sort.dir === "asc" ? ("desc" as const) : ("asc" as const) };
    setSort(next);
    update("sort", next);
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
      toast.error("No files could be uploaded. Use PDF, DOCX, or image files up to 25 MB.");
      return;
    }
    // Files dropped on a filtered view land where that view is looking.
    const association = linked
      ? { targetType: linked.type, targetId: linked.id }
      : { targetType: "workspace" as const, targetId: null };
    let uploaded = 0;
    setUploadProgress({ done: 0, total: valid.length });
    for (const [index, file] of valid.entries()) {
      try {
        const { key, checksum } = await uploadToStorage(file);
        const result = await createDocument({
          name: file.name.replace(/\.[^.]+$/, "") || file.name,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          checksum,
          storageKey: key,
          categoryId: category !== "all" ? category : null,
          association,
        });
        if (result.ok) uploaded += 1;
        else rejected += 1;
      } catch {
        rejected += 1;
      }
      setUploadProgress({ done: index + 1, total: valid.length });
    }
    setUploadProgress(null);
    if (uploaded > 0)
      toast.success(
        `${uploaded} document${uploaded === 1 ? "" : "s"} uploaded${linkedName ? ` to ${linkedName}` : ""}`,
      );
    if (rejected > 0) toast.error(`${rejected} file${rejected === 1 ? "" : "s"} could not be uploaded`);
    router.refresh();
  }

  function runBulk(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
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

  async function bulkDelete() {
    if (
      !(await confirm({
        tone: "destructive",
        title: `Delete ${selectedInView.length} document${selectedInView.length === 1 ? "" : "s"} permanently?`,
        description: "They are removed for everyone, along with their version history. This cannot be undone.",
        confirmLabel: `Delete ${selectedInView.length} document${selectedInView.length === 1 ? "" : "s"}`,
      }))
    )
      return;
    runBulk(() => bulkDeleteDocuments({ documentIds: selectedInView }), "Documents deleted");
  }

  const inArchive = focus === "archived";
  const tiles: Array<{ key: HubFocus; label: string; tone?: string }> = [
    { key: "active", label: "Active" },
    { key: "pending", label: "Awaiting signature", tone: "text-warning-clay" },
    { key: "expiring", label: "Expiring in 30 days", tone: "text-warning-clay" },
    { key: "lapsed", label: "Date passed", tone: "text-danger-rust" },
    { key: "archived", label: "Archived" },
  ];

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
      <DropOverlay active={pageDragging}>
        Drop files to upload {linkedName ? `to ${linkedName}` : "to the workspace library"}
      </DropOverlay>
      <DocumentsWorkspaceTabs active="files" canReadDocuments canManageTemplates={canManageTemplates} />
      <PageHeader
        className="duration-500 animate-in fade-in slide-in-from-bottom-1"
        title="Documents"
        description="A secure home for the files that move candidates, offers, and hiring decisions forward."
        actions={
          <>
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              <FolderCog className="size-4" />
              Categories
            </Button>
            {data.canManage ? (
              <>
                <Button variant="outline" onClick={() => setGenerateOpen(true)}>
                  <FileText className="size-4" />
                  Generate document
                </Button>
                <Button onClick={() => setUploadOpen(true)} disabled={uploadProgress !== null}>
                  <Upload className="size-4" />
                  {uploadProgress ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…` : "Upload document"}
                </Button>
              </>
            ) : null}
          </>
        }
      />
      {linked ? (
        <Callout tone="info" className="py-2.5">
          <span className="flex items-center justify-between gap-3">
            <span>
              Showing documents linked to <strong className="font-medium text-near-ink">{linkedName ?? "this " + linked.type}</strong>.
              Files you drop here are linked to them too.
            </span>
            <button
              type="button"
              onClick={() => {
                setLinked(null);
                update("linked", null);
              }}
              aria-label="Clear linked filter"
              className="rounded-full p-1 text-soft-ink transition-colors hover:bg-soft-kraft hover:text-near-ink"
            >
              <X className="size-3.5" />
            </button>
          </span>
        </Callout>
      ) : null}
      <Card className="grid grid-cols-2 gap-3 p-4 duration-500 animate-in fade-in slide-in-from-bottom-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            aria-pressed={focus === tile.key}
            onClick={() => {
              setFocus(tile.key);
              clearSelection();
              update("focus", tile.key);
            }}
            className="rounded-[var(--radius-inner)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/20"
          >
            <StatTile
              className="h-full cursor-pointer hover:bg-soft-kraft data-[selected]:hover:bg-pure-snow"
              label={tile.label}
              selected={focus === tile.key}
              muted={counts[tile.key] === 0}
              value={<span className={tile.tone}>{counts[tile.key]}</span>}
            />
          </button>
        ))}
      </Card>
      <section className="space-y-3 duration-500 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
          <div className="relative min-w-0 flex-1 lg:min-w-64">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-soft-ink" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                update("q", event.target.value);
              }}
              placeholder="Search documents, owners, or original names"
              aria-label="Search documents"
              className="h-9 rounded-full pl-10"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              label="Category"
              value={category}
              onChange={(value) => {
                setCategory(value);
                update("category", value);
              }}
              options={["all", ...data.categories.filter((item) => item.active).map((item) => item.id)]}
              labelMap={{ all: "All", ...Object.fromEntries(data.categories.map((item) => [item.id, item.name])) }}
              allValue="all"
            />
            <FilterPill
              label="Signature"
              value={signature}
              onChange={(value) => {
                setSignature(value);
                update("signature", value);
              }}
              options={["all", ...Object.keys(SIGNATURE_STATUS_META)]}
              labelMap={{ all: "All", ...Object.fromEntries(Object.entries(SIGNATURE_STATUS_META).map(([key, item]) => [key, item.label])) }}
              allValue="all"
            />
            <FilterPill
              label="Owner"
              value={mine ? "mine" : "all"}
              onChange={(value) => {
                setMine(value === "mine");
                update("mine", value === "mine");
              }}
              options={["all", "mine"]}
              labelMap={{ all: "Anyone", mine: "Me" }}
              allValue="all"
            />
            <LinkedPicker
              options={data.associationOptions}
              value={linked}
              onChange={(next) => {
                setLinked(next);
                update("linked", next);
              }}
            />
            <FilterPill
              label="Sort"
              value={`${sort.key}:${sort.dir}`}
              onChange={(value) => {
                const [key, dir] = value.split(":") as [SortKey, SortDir];
                setSort({ key, dir });
                update("sort", { key, dir });
              }}
              options={Object.keys(SORT_LABELS)}
              labelMap={SORT_LABELS}
              allValue="updated:desc"
            />
            <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-soft-kraft p-1">
              {(["list", "grid"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-label={mode === "list" ? "List view" : "Grid view"}
                  aria-pressed={view === mode}
                  onClick={() => setView(mode)}
                  className={`flex size-8 items-center justify-center rounded-full transition-colors ${view === mode ? "bg-pure-snow text-near-ink" : "text-soft-ink hover:text-near-ink"}`}
                >
                  {mode === "list" ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-soft-ink" aria-live="polite">
          {filtered.length} of {data.documents.length} document{data.documents.length === 1 ? "" : "s"}
          {filtersActive ? (
            <button type="button" onClick={clearFilters} className="ml-2 font-medium text-near-ink underline underline-offset-2">
              Clear filters
            </button>
          ) : null}
        </p>
      </section>
      {data.canManage && selectedInView.length > 0 ? (
        <section className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] bg-lime-wash px-4 py-2.5 animate-in fade-in slide-in-from-top-1">
          <span className="text-sm font-medium">
            {selectedInView.length} selected
            {heldSelected.length > 0 ? (
              <span className="ml-2 font-normal text-soft-ink">
                {heldSelected.length} under legal hold
              </span>
            ) : null}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={inArchive || archivableIds.length === 0}
              onClick={() =>
                runBulk(
                  () => bulkSetDocumentStatus({ documentIds: archivableIds, status: "archived" }),
                  heldSelected.length > 0
                    ? `${archivableIds.length} archived, ${heldSelected.length} skipped (legal hold)`
                    : "Documents archived",
                )
              }
            >
              <Archive className="size-4" />
              Archive{heldSelected.length > 0 && archivableIds.length > 0 ? ` ${archivableIds.length}` : ""}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!inArchive}
              onClick={() =>
                runBulk(
                  () => bulkSetDocumentStatus({ documentIds: selectedInView, status: "active" }),
                  "Documents restored",
                )
              }
            >
              <ArchiveRestore className="size-4" />
              Restore
            </Button>
            <Select
              value=""
              disabled={inArchive}
              onValueChange={(value) =>
                runBulk(
                  () =>
                    bulkSetDocumentCategory({
                      documentIds: selectedInView,
                      categoryId: value === "none" ? null : value,
                    }),
                  "Category updated",
                )
              }
            >
              <SelectTrigger size="sm" className="w-40 rounded-[var(--radius-btn)]" aria-label="Set category">
                <SelectValue placeholder="Set category…" />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectItem value="none">No category</SelectItem>
                {data.categories
                  .filter((item) => item.active)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
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
        <section className="overflow-hidden rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-card)] duration-500 animate-in fade-in slide-in-from-bottom-3">
          <div
            className={`hidden gap-4 border-b border-hairline px-4 py-3 text-[11px] font-medium tracking-wide text-soft-ink md:grid ${DOCUMENT_LIST_GRID}`}
          >
            {data.canManage ? (
              <span className="flex items-center">
                <Checkbox checked={allInViewSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
              </span>
            ) : (
              <span />
            )}
            <SortHeader label="Name" sortKey="name" active={sort.key === "name"} dir={sort.dir} onSort={onSort} />
            <span className="uppercase">Status</span>
            <span className="uppercase">Linked to</span>
            <span className="uppercase">Owner</span>
            <SortHeader label="Expires" sortKey="expires" active={sort.key === "expires"} dir={sort.dir} onSort={onSort} />
            <SortHeader label="Updated" sortKey="updated" active={sort.key === "updated"} dir={sort.dir} onSort={onSort} />
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              data={data}
              filtered={filtersActive}
              onUpload={() => setUploadOpen(true)}
              onGenerate={() => setGenerateOpen(true)}
              onClear={clearFilters}
            />
          ) : (
            <ul className="divide-y divide-hairline">
              {filtered.map((document) => {
                const Icon = iconForDocument(document.mimeType);
                const isSelected = selectedIds.has(document.id);
                return (
                  <li
                    key={document.id}
                    className={`relative grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-row-wash md:items-center md:gap-4 ${DOCUMENT_LIST_GRID} ${isSelected ? "bg-lime-wash" : ""}`}
                  >
                    {data.canManage ? (
                      <span className="absolute top-2 right-2 z-10 md:static md:flex md:items-center">
                        {/* A 44px tap target around the 16px box. */}
                        <label className="-m-2.5 flex cursor-pointer items-center p-2.5">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelected(document.id)}
                            aria-label={`Select ${document.name}`}
                          />
                        </label>
                      </span>
                    ) : (
                      <span className="hidden md:block" />
                    )}
                    <Link
                      href={`/dashboard/documents/${document.id}` as Route}
                      className="flex min-w-0 items-center gap-3 pr-8 outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-near-ink md:pr-0"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow text-near-ink">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-near-ink">{document.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-soft-ink">
                          {documentTypeLabel(document.mimeType)} · {formatDocumentSize(document.sizeBytes)}
                          <span className="md:hidden"> · {formatDate(document.updatedAt)}</span>
                        </span>
                      </span>
                    </Link>
                    <span className="flex items-center gap-2 pl-12 md:pl-0">
                      <StateCell document={document} />
                      <span className="text-xs text-soft-ink md:hidden">
                        <ExpiresCell document={document} />
                      </span>
                    </span>
                    <span className="hidden truncate text-xs text-soft-ink md:block">
                      {document.associationLabels.join(" · ")}
                    </span>
                    <span className="hidden items-center gap-2 truncate text-xs text-soft-ink md:flex">
                      <OwnerCell document={document} />
                    </span>
                    <span className="hidden text-xs text-soft-ink md:block">
                      <ExpiresCell document={document} />
                    </span>
                    <span className="hidden text-xs text-soft-ink md:block">{formatDate(document.updatedAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : filtered.length === 0 ? (
        <section className="overflow-hidden rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-card)] duration-500 animate-in fade-in slide-in-from-bottom-3">
          <EmptyState
            data={data}
            filtered={filtersActive}
            onUpload={() => setUploadOpen(true)}
            onGenerate={() => setGenerateOpen(true)}
            onClear={clearFilters}
          />
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-3 duration-500 animate-in fade-in slide-in-from-bottom-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((document) => {
            const Icon = iconForDocument(document.mimeType);
            const isSelected = selectedIds.has(document.id);
            return (
              <div
                key={document.id}
                className={`relative flex flex-col rounded-[var(--radius-card)] bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:bg-row-wash ${isSelected ? "ring-2 ring-near-ink" : ""}`}
              >
                {data.canManage ? (
                  <span className="absolute top-2 right-2 z-10">
                    <label className="flex cursor-pointer items-center p-2.5">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelected(document.id)}
                        aria-label={`Select ${document.name}`}
                      />
                    </label>
                  </span>
                ) : null}
                <Link
                  href={`/dashboard/documents/${document.id}` as Route}
                  className="flex flex-1 flex-col outline-none after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:after:ring-2 focus-visible:after:ring-near-ink"
                >
                  <span className="flex size-10 items-center justify-center rounded-[var(--radius-btn)] bg-lime-wash text-sage-ink">
                    <Icon className="size-5" />
                  </span>
                  <span className="mt-3 line-clamp-2 text-sm font-medium text-near-ink">{document.name}</span>
                  <span className="mt-1 text-xs text-soft-ink">
                    {documentTypeLabel(document.mimeType)} · {formatDocumentSize(document.sizeBytes)}
                  </span>
                  <span className="mt-1 truncate text-xs text-soft-ink">
                    {document.associationLabels.join(" · ")} · {document.ownerName ?? "Workspace"}
                  </span>
                  <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3">
                    <StateCell document={document} />
                    <span className="text-xs text-soft-ink">
                      {document.expiresAt ? `Expires ${formatDate(document.expiresAt)}` : `Updated ${formatDate(document.updatedAt)}`}
                    </span>
                  </span>
                </Link>
              </div>
            );
          })}
        </section>
      )}
      <UploadDialog
        key={linked ? `${linked.type}:${linked.id}` : "none"}
        data={data}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        defaultAssociation={linked}
      />
      <GenerateDocumentDialog open={generateOpen} onOpenChange={setGenerateOpen} />
      <CategoryDialog data={data} open={categoriesOpen} onOpenChange={setCategoriesOpen} />
    </div>
  );
}
