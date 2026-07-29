"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  Mail,
  MoreHorizontal,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import {
  bulkTrashCandidatesAction,
  bulkUpdateCandidateStatusAction,
  trashCandidateAction,
} from "@/features/candidates/actions";
import { addToPoolAction, removeFromPoolAction } from "@/features/pool/actions";
import { toCsv } from "@/lib/csv";
import { BulkEmailDrawer } from "@/features/candidates/BulkEmailDrawer";
import type { EmailTemplateOption } from "@/features/candidates/EmailDrawer";
import {
  ImportCandidatesDrawer,
  type ImportJobOption,
  type ImportSource,
} from "@/features/candidates/import/ImportCandidatesDrawer";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { PipelineSpine } from "@/components/ui/PipelineSpine";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { FilterPill, FILTER_ALL } from "@/components/ui/FilterPill";
import { BookmarkSimpleIcon } from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";

export type CandidateRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  avatarUrl: string | null;
  avatarFallbackSrcs: string[];
  role: string | null;
  department: string | null;
  stage: string | null;
  status: "active" | "hired" | "rejected" | "withdrawn" | null;
  source: string | null;
  tags: string[];
  /** Epoch millis for sorting (null when no application). */
  appliedAt: number | null;
  /** Pre-formatted label (computed server-side to avoid hydration drift). */
  appliedLabel: string | null;
  applicationId: string | null;
  /** Epoch millis of last candidate update. */
  updatedAt: number;
  inPool: boolean;
  /** Has a pending or in-progress data-export/erasure request awaiting review. */
  hasOpenPrivacyRequest: boolean;
};

type SortKey = "recent" | "oldest" | "modified" | "name";

function uniqueSorted(values: (string | null)[]) {
  return Array.from(
    new Set(values.filter((v): v is string => Boolean(v))),
  ).sort((a, b) => a.localeCompare(b));
}

const CSV_HEADERS = [
  "Full name",
  "Email",
  "Phone",
  "Location",
  "Role",
  "Department",
  "Stage",
  "Status",
  "Source",
  "Tags",
  "Applied at",
];

function candidateToCsvRow(row: CandidateRow): string[] {
  return [
    row.fullName,
    row.email,
    row.phone ?? "",
    row.location ?? "",
    row.role ?? "",
    row.department ?? "",
    row.stage ?? "",
    row.status ?? "",
    row.source ?? "",
    row.tags.join("; "),
    row.appliedAt ? new Date(row.appliedAt).toISOString().slice(0, 10) : "",
  ];
}

// Leading BOM helps Excel detect UTF-8 (accented names, etc.) on download.
const UTF8_BOM = String.fromCharCode(0xfeff);

function downloadCsv(filename: string, rows: string[][]) {
  const csv = toCsv(rows);
  const blob = new Blob([UTF8_BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CandidatesTable({
  rows,
  emailTemplates = [],
  importJobs = [],
  initialImportSource,
}: {
  rows: CandidateRow[];
  emailTemplates?: EmailTemplateOption[];
  importJobs?: ImportJobOption[];
  initialImportSource?: ImportSource;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [dept, setDept] = useState(FILTER_ALL);
  const [role, setRole] = useState(FILTER_ALL);
  const [stage, setStage] = useState(FILTER_ALL);
  const [status, setStatus] = useState(FILTER_ALL);
  const [source, setSource] = useState(FILTER_ALL);
  const [tag, setTag] = useState(FILTER_ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const departments = useMemo(
    () => uniqueSorted(rows.map((r) => r.department)),
    [rows],
  );
  const roles = useMemo(() => uniqueSorted(rows.map((r) => r.role)), [rows]);
  const stages = useMemo(() => uniqueSorted(rows.map((r) => r.stage)), [rows]);
  const sources = useMemo(
    () => uniqueSorted(rows.map((r) => r.source)),
    [rows],
  );
  const tagOptions = useMemo(
    () => uniqueSorted(rows.flatMap((r) => r.tags)),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (q) {
        const hit =
          r.fullName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          (r.role ?? "").toLowerCase().includes(q) ||
          (r.location ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (dept !== FILTER_ALL && r.department !== dept) return false;
      if (role !== FILTER_ALL && r.role !== role) return false;
      if (stage !== FILTER_ALL && r.stage !== stage) return false;
      if (status !== FILTER_ALL && r.status !== status) return false;
      if (source !== FILTER_ALL && r.source !== source) return false;
      if (tag !== FILTER_ALL && !r.tags.includes(tag)) return false;
      return true;
    });

    return [...base].sort((a, b) => {
      if (sortKey === "name") return a.fullName.localeCompare(b.fullName);
      if (sortKey === "modified") return b.updatedAt - a.updatedAt;
      if (sortKey === "oldest") return (a.appliedAt ?? 0) - (b.appliedAt ?? 0);
      // "recent" , whichever happened last wins: new application OR last modified
      const aRecent = Math.max(a.appliedAt ?? 0, a.updatedAt);
      const bRecent = Math.max(b.appliedAt ?? 0, b.updatedAt);
      return bRecent - aRecent;
    });
  }, [rows, query, dept, role, stage, status, source, tag, sortKey]);

  const filtersActive =
    dept !== FILTER_ALL ||
    role !== FILTER_ALL ||
    stage !== FILTER_ALL ||
    status !== FILTER_ALL ||
    source !== FILTER_ALL ||
    tag !== FILTER_ALL ||
    query.trim() !== "";

  function clearFilters() {
    setQuery("");
    setDept(FILTER_ALL);
    setRole(FILTER_ALL);
    setStage(FILTER_ALL);
    setStatus(FILTER_ALL);
    setSource(FILTER_ALL);
    setTag(FILTER_ALL);
  }

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runBulk(next: "hired" | "rejected" | "active") {
    const applicationIds = filtered
      .filter((r) => selected.has(r.id) && r.applicationId)
      .map((r) => r.applicationId as string);

    if (applicationIds.length === 0) {
      toast.error("Selected candidates have no application to update.");
      return;
    }
    startTransition(async () => {
      const result = await bulkUpdateCandidateStatusAction({
        applicationIds,
        status: next,
      });
      if (result.success) {
        toast.success(
          `Updated ${applicationIds.length} candidate${applicationIds.length === 1 ? "" : "s"}.`,
        );
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not update candidates.");
      }
    });
  }

  function runRowStatus(
    row: CandidateRow,
    next: "hired" | "rejected" | "active",
  ) {
    if (!row.applicationId) {
      toast.error("This candidate has no application to update.");
      return;
    }
    startTransition(async () => {
      const result = await bulkUpdateCandidateStatusAction({
        applicationIds: [row.applicationId as string],
        status: next,
      });
      if (result.success) {
        toast.success(`${row.fullName} updated.`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not update candidate.");
      }
    });
  }

  function runDelete(row: CandidateRow) {
    if (
      !window.confirm(
        `Delete ${row.fullName} permanently? This removes their profile and related records.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await trashCandidateAction(row.id);
      if (result.success) {
        toast.success(`${row.fullName} deleted permanently.`);
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not delete candidate.");
      }
    });
  }

  function runTogglePool(row: CandidateRow) {
    startTransition(async () => {
      const result = row.inPool
        ? await removeFromPoolAction({ candidateId: row.id })
        : await addToPoolAction({ candidateId: row.id, source: "sourced" });
      if (result.success) {
        toast.success(
          row.inPool
            ? `${row.fullName} removed from pool.`
            : `${row.fullName} added to pool.`,
        );
        router.refresh();
      } else {
        toast.error(
          result.error ??
            (row.inPool
              ? "Could not remove from pool."
              : "Could not add to pool."),
        );
        router.refresh();
      }
    });
  }

  function runBulkDelete() {
    const ids = filtered.filter((r) => selected.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} candidate${ids.length === 1 ? "" : "s"} permanently? This cannot be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await bulkTrashCandidatesAction(ids);
      if (result.success) {
        const count = result.count ?? ids.length;
        toast.success(
          `Deleted ${count} candidate${count === 1 ? "" : "s"} permanently.`,
        );
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not delete candidates.");
      }
    });
  }

  const selectedCount = filtered.filter((r) => selected.has(r.id)).length;

  function exportCsv() {
    const exportRows =
      selectedCount > 0 ? filtered.filter((r) => selected.has(r.id)) : filtered;
    if (exportRows.length === 0) {
      toast.error("No candidates to export.");
      return;
    }
    downloadCsv(`candidates-${new Date().toISOString().slice(0, 10)}.csv`, [
      CSV_HEADERS,
      ...exportRows.map(candidateToCsvRow),
    ]);
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidates by name, email, role or location…"
            className="h-11 rounded-full pl-11"
          />
        </div>
        <Button
          variant="outline"
          className="h-11 rounded-lg"
          onClick={exportCsv}
        >
          <Download className="size-4" />
          <span className="hidden sm:inline">
            {selectedCount > 0
              ? `Export selected (${selectedCount})`
              : "Export CSV"}
          </span>
          <span className="sm:hidden">
            {selectedCount > 0 ? `(${selectedCount})` : "CSV"}
          </span>
        </Button>
        <ImportCandidatesDrawer
          jobs={importJobs}
          initialSource={initialImportSource}
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          label="Department"
          value={dept}
          onChange={setDept}
          options={departments}
        />
        <FilterPill
          label="Job"
          value={role}
          onChange={setRole}
          options={roles}
        />
        <FilterPill
          label="Stage"
          value={stage}
          onChange={setStage}
          options={stages}
        />
        <FilterPill
          label="Status"
          value={status}
          onChange={setStatus}
          options={["active", "hired", "rejected", "withdrawn"]}
          labelMap={{
            active: "Active",
            hired: "Hired",
            rejected: "Rejected",
            withdrawn: "Withdrawn",
          }}
        />
        {sources.length > 0 ? (
          <FilterPill
            label="Source"
            value={source}
            onChange={setSource}
            options={sources}
          />
        ) : null}
        {tagOptions.length > 0 ? (
          <FilterPill
            label="Tag"
            value={tag}
            onChange={setTag}
            options={tagOptions}
          />
        ) : null}
        <FilterPill
          label="Sort"
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={["recent", "oldest", "modified", "name"]}
          labelMap={{
            recent: "Most recent",
            oldest: "Oldest",
            modified: "Last modified",
            name: "Name A–Z",
          }}
          allValue="recent"
        />
        {filtersActive ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="rounded-full text-muted-foreground"
          >
            Clear
          </Button>
        ) : null}
        <p className="ml-auto text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {filtered.length}
          </span>{" "}
          {filtered.length === 1 ? "candidate" : "candidates"}
        </p>
      </div>

      {/* Bulk bar */}
      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-accent/40 px-3 py-2 duration-200 animate-in fade-in slide-in-from-top-1">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setBulkEmailOpen(true)}
            >
              <Mail className="size-4" />
              Email
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => runBulk("hired")}
            >
              <CheckCircle2 className="size-4 text-primary" />
              Mark hired
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => runBulk("rejected")}
            >
              <XCircle className="size-4 text-destructive" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => runBulk("active")}
            >
              <RotateCcw className="size-4" />
              Reactivate
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              className="text-destructive hover:text-destructive"
              onClick={runBulkDelete}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {/* Candidate list */}
      <div>
        <div className="min-w-0">
          {/* Column headers , aligned to the row grid */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 pb-2 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_7rem_2.25rem]">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={toggleAll}
              aria-label="Select all"
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Candidate
            </span>
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:block">
              Pipeline
            </span>
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:block">
              Status
            </span>
            <span aria-hidden className="hidden sm:block" />
          </div>

          <div>
            {filtered.map((row) => {
              const isSelected = selected.has(row.id);
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={() => router.push(`/dashboard/candidates/${row.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      router.push(`/dashboard/candidates/${row.id}`);
                  }}
                  className={cn(
                    "group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 rounded-xl border-b border-border/40 px-4 py-4 transition-all sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_7rem_2.25rem]",
                    isSelected
                      ? "border-transparent bg-card shadow-[0_1px_3px_rgba(28,25,23,0.08),0_0_0_1px_rgba(28,25,23,0.04)]"
                      : "hover:bg-muted/40",
                  )}
                >
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleOne(row.id)}
                      aria-label={`Select ${row.fullName}`}
                    />
                  </div>

                  {/* Identity */}
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      name={row.fullName}
                      src={row.avatarUrl}
                      fallbackSrcs={row.avatarFallbackSrcs}
                      size="lg"
                    />
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className="truncate font-medium text-foreground group-hover:text-primary">
                          {row.fullName}
                        </p>
                        {row.department ? (
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                              departmentChipClass(row.department),
                            )}
                          >
                            {row.department}
                          </span>
                        ) : null}
                        {row.inPool ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                            <BookmarkSimpleIcon className="size-3 fill-current" />
                            In Pool
                          </span>
                        ) : null}
                        {row.hasOpenPrivacyRequest ? (
                          <span
                            title="Has a pending privacy request awaiting review"
                            className="inline-flex items-center gap-1 rounded-full bg-clay/10 px-1.5 py-0.5 text-[11px] font-semibold text-clay"
                          >
                            <ShieldAlert className="size-3" />
                            Privacy request
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {[row.role, row.location].filter(Boolean).join(" · ") ||
                          row.email}
                      </p>
                      {row.tags.length > 0 ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {row.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground"
                            >
                              {t}
                            </span>
                          ))}
                          {row.tags.length > 3 ? (
                            <span className="text-muted-foreground">
                              +{row.tags.length - 3}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Pipeline */}
                  <div className="col-start-2 min-w-0 sm:col-auto">
                    {row.stage ? (
                      <>
                        <p className="text-xs font-medium text-foreground">
                          {row.stage}
                        </p>
                        <PipelineSpine
                          current={row.stage}
                          className="mt-1.5 max-w-40"
                        />
                        {row.appliedLabel ? (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {row.appliedLabel}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No application
                      </p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="col-start-2 sm:col-auto">
                    {row.status ? (
                      <ApplicationStatusBadge status={row.status} />
                    ) : null}
                  </div>

                  {/* Row actions */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="col-start-3 row-start-1 sm:col-auto sm:row-auto"
                  >
                    <RowActions
                      row={row}
                      disabled={isPending}
                      onView={() =>
                        router.push(`/dashboard/candidates/${row.id}`)
                      }
                      onStatus={(next) => runRowStatus(row, next)}
                      onDelete={() => runDelete(row)}
                      onTogglePool={() => runTogglePool(row)}
                    />
                  </div>
                </div>
              );
            })}

            {/*
              Two different situations that used to share one message. A new
              workspace with no candidates was being told its filters were
              wrong, which is both untrue and unhelpful.
            */}
            {filtered.length === 0 ? (
              filtersActive ? (
                <EmptyState
                  variant="filtered"
                  icon={Search}
                  title="Nobody matches these filters"
                  hint="Widen the search, or clear the filters to see everyone again."
                  action={
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={Users}
                  title="No candidates yet"
                  hint="They arrive when someone applies through your career page, or you add one by hand."
                />
              )
            ) : null}
          </div>
        </div>

        <BulkEmailDrawer
          open={bulkEmailOpen}
          onOpenChange={setBulkEmailOpen}
          candidateIds={filtered
            .filter((r) => selected.has(r.id))
            .map((r) => r.id)}
          templates={emailTemplates}
          onSent={() => setSelected(new Set())}
        />
      </div>
    </div>
  );
}

// Stable accent per department so the chip color is consistent across rows.
const DEPARTMENT_CHIP_CLASSES = [
  "bg-primary/10 text-primary",
  "bg-clay/15 text-clay",
  "bg-slate-info/15 text-slate-info",
  "bg-accent text-accent-foreground",
];

function departmentChipClass(department: string) {
  let hash = 0;
  for (let i = 0; i < department.length; i++) {
    hash = (hash * 31 + department.charCodeAt(i)) | 0;
  }
  return DEPARTMENT_CHIP_CLASSES[
    Math.abs(hash) % DEPARTMENT_CHIP_CLASSES.length
  ];
}

function RowActions({
  row,
  disabled,
  onView,
  onStatus,
  onDelete,
  onTogglePool,
}: {
  row: CandidateRow;
  disabled: boolean;
  onView: () => void;
  onStatus: (next: "hired" | "rejected" | "active") => void;
  onDelete: () => void;
  onTogglePool: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label={`Actions for ${row.fullName}`}
          disabled={disabled}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onView}>
          <User className="size-4" />
          View profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onStatus("hired")}>
          <CheckCircle2 className="size-4 text-primary" />
          Mark hired
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onStatus("rejected")}
        >
          <XCircle className="size-4" />
          Reject
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onStatus("active")}>
          <RotateCcw className="size-4" />
          Reactivate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onTogglePool}>
          <BookmarkSimpleIcon
            className={cn("size-4", row.inPool && "fill-current")}
          />
          {row.inPool ? "Remove from Pool" : "Add to Pool"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
