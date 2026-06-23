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
  Sparkles,
  Star,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  bulkTrashCandidatesAction,
  bulkUpdateCandidateStatusAction,
  restoreCandidateAction,
  trashCandidateAction,
} from "@/features/candidates/actions";
import { addToPoolAction, removeFromPoolAction } from "@/features/pool/actions";
import { toCsv } from "@/lib/csv";
import { BulkEmailDrawer } from "@/features/candidates/BulkEmailDrawer";
import type { EmailTemplateOption } from "@/features/candidates/EmailDrawer";
import {
  ImportCandidatesDrawer,
  type ImportJobOption,
} from "@/features/candidates/import/ImportCandidatesDrawer";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { PipelineSpine } from "@/components/ui/PipelineSpine";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CandidateRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  avatarUrl: string | null;
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
};

type SortKey = "recent" | "oldest" | "modified" | "name";
const ALL = "__all__";

function uniqueSorted(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort(
    (a, b) => a.localeCompare(b),
  );
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
}: {
  rows: CandidateRow[];
  emailTemplates?: EmailTemplateOption[];
  importJobs?: ImportJobOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [dept, setDept] = useState(ALL);
  const [role, setRole] = useState(ALL);
  const [stage, setStage] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [tag, setTag] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const departments = useMemo(() => uniqueSorted(rows.map((r) => r.department)), [rows]);
  const roles = useMemo(() => uniqueSorted(rows.map((r) => r.role)), [rows]);
  const stages = useMemo(() => uniqueSorted(rows.map((r) => r.stage)), [rows]);
  const sources = useMemo(() => uniqueSorted(rows.map((r) => r.source)), [rows]);
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
      if (dept !== ALL && r.department !== dept) return false;
      if (role !== ALL && r.role !== role) return false;
      if (stage !== ALL && r.stage !== stage) return false;
      if (status !== ALL && r.status !== status) return false;
      if (source !== ALL && r.source !== source) return false;
      if (tag !== ALL && !r.tags.includes(tag)) return false;
      return true;
    });

    return [...base].sort((a, b) => {
      if (sortKey === "name") return a.fullName.localeCompare(b.fullName);
      if (sortKey === "modified") return b.updatedAt - a.updatedAt;
      if (sortKey === "oldest") return (a.appliedAt ?? 0) - (b.appliedAt ?? 0);
      // "recent" — whichever happened last wins: new application OR last modified
      const aRecent = Math.max(a.appliedAt ?? 0, a.updatedAt);
      const bRecent = Math.max(b.appliedAt ?? 0, b.updatedAt);
      return bRecent - aRecent;
    });
  }, [rows, query, dept, role, stage, status, source, tag, sortKey]);

  const filtersActive =
    dept !== ALL ||
    role !== ALL ||
    stage !== ALL ||
    status !== ALL ||
    source !== ALL ||
    tag !== ALL ||
    query.trim() !== "";

  function clearFilters() {
    setQuery("");
    setDept(ALL);
    setRole(ALL);
    setStage(ALL);
    setStatus(ALL);
    setSource(ALL);
    setTag(ALL);
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

  function runRowStatus(row: CandidateRow, next: "hired" | "rejected" | "active") {
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
        `Move ${row.fullName} to trash? You can restore them later from the Trash tab.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await trashCandidateAction(row.id);
      if (result.success) {
        toast.success(`${row.fullName} moved to trash.`, {
          action: {
            label: "Undo",
            onClick: () => {
              startTransition(async () => {
                await restoreCandidateAction(row.id);
                router.refresh();
              });
            },
          },
        });
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
      const result = await addToPoolAction({ candidateId: row.id, source: "sourced" });
      if (result.success) {
        toast.success(`${row.fullName} added to pool.`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not add to pool.");
      }
    });
  }

  function runBulkDelete() {
    const ids = filtered.filter((r) => selected.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Move ${ids.length} candidate${ids.length === 1 ? "" : "s"} to trash? You can restore them later from the Trash tab.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await bulkTrashCandidatesAction(ids);
      if (result.success) {
        const count = result.count ?? ids.length;
        toast.success(`Moved ${count} candidate${count === 1 ? "" : "s"} to trash.`, {
          action: {
            label: "Undo",
            onClick: () => {
              startTransition(async () => {
                await Promise.all(ids.map((id) => restoreCandidateAction(id)));
                router.refresh();
              });
            },
          },
        });
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not delete candidates.");
      }
    });
  }

  const selectedCount = filtered.filter((r) => selected.has(r.id)).length;

  function exportCsv() {
    const exportRows = selectedCount > 0 ? filtered.filter((r) => selected.has(r.id)) : filtered;
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
        <Button variant="outline" className="h-11 rounded-full" onClick={exportCsv}>
          <Download className="size-4" />
          {selectedCount > 0 ? `Export selected (${selectedCount})` : "Export CSV"}
        </Button>
        <ImportCandidatesDrawer jobs={importJobs} />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill label="Department" value={dept} onChange={setDept} options={departments} />
        <FilterPill label="Job" value={role} onChange={setRole} options={roles} />
        <FilterPill label="Stage" value={stage} onChange={setStage} options={stages} />
        <FilterPill
          label="Status"
          value={status}
          onChange={setStatus}
          options={["active", "hired", "rejected", "withdrawn"]}
          labelMap={{ active: "Active", hired: "Hired", rejected: "Rejected", withdrawn: "Withdrawn" }}
        />
        {sources.length > 0 ? (
          <FilterPill label="Source" value={source} onChange={setSource} options={sources} />
        ) : null}
        {tagOptions.length > 0 ? (
          <FilterPill label="Tag" value={tag} onChange={setTag} options={tagOptions} />
        ) : null}
        <FilterPill
          label="Sort"
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={["recent", "oldest", "modified", "name"]}
          labelMap={{ recent: "Most recent", oldest: "Oldest", modified: "Last modified", name: "Name A–Z" }}
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
          <span className="font-semibold tabular-nums text-foreground">{filtered.length}</span>{" "}
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
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => runBulk("hired")}>
              <CheckCircle2 className="size-4 text-primary" />
              Mark hired
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => runBulk("rejected")}>
              <XCircle className="size-4 text-destructive" />
              Reject
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => runBulk("active")}>
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
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {/* List + AI rail */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {/* Column headers — aligned to the row grid */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 pb-2 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_7rem_2.25rem]">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={toggleAll}
              aria-label="Select all"
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              Candidate
            </span>
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 sm:block">
              Pipeline
            </span>
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 sm:block">
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
                    if (e.key === "Enter") router.push(`/dashboard/candidates/${row.id}`);
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
                    <UserAvatar name={row.fullName} src={row.avatarUrl} size="lg" />
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
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {[row.role, row.location].filter(Boolean).join(" · ") || row.email}
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
                            <span className="text-muted-foreground/70">
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
                        <p className="text-xs font-medium text-foreground">{row.stage}</p>
                        <PipelineSpine current={row.stage} className="mt-1.5 max-w-40" />
                        {row.appliedLabel ? (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {row.appliedLabel}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No application</p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="col-start-2 sm:col-auto">
                    {row.status ? <ApplicationStatusBadge status={row.status} /> : null}
                  </div>

                  {/* Row actions */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="col-start-3 row-start-1 sm:col-auto sm:row-auto"
                  >
                    <RowActions
                      row={row}
                      disabled={isPending}
                      onView={() => router.push(`/dashboard/candidates/${row.id}`)}
                      onStatus={(next) => runRowStatus(row, next)}
                      onDelete={() => runDelete(row)}
                      onTogglePool={() => runTogglePool(row)}
                    />
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
                <Search className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No candidates match your filters.
                </p>
                {filtersActive ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null}
              </div>
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

        {/* AI sourcing rail */}
        <aside className="h-fit lg:sticky lg:top-20">
          <div className="rounded-2xl border border-border/70 bg-card p-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-accent-foreground">
              <Sparkles className="size-3.5" />
              AI sourcing
            </span>
            <p className="mt-3 text-sm font-semibold">Expand your candidate pool</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Search passive candidates from job boards, social and external
              databases against your own criteria.
            </p>
            <Button disabled className="mt-4 w-full" variant="outline">
              Find candidates
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Coming soon — connect your own AI keys.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Remote-style filter pill: muted label + bold current value in one rounded
 * chip. `allValue` marks the neutral option (no "All" item is injected when
 * the options list already covers every state, e.g. sort).
 */
function FilterPill({
  label,
  value,
  onChange,
  options,
  labelMap,
  allValue,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labelMap?: Record<string, string>;
  allValue?: string;
}) {
  const neutral = allValue ?? ALL;
  const active = value !== neutral;
  const display =
    value === ALL ? "All" : (labelMap?.[value] ?? value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className={cn(
          "h-9 w-auto gap-1.5 rounded-full border bg-card px-3.5 shadow-none",
          active && "border-primary/40 bg-accent/40",
        )}
      >
        <span className="text-muted-foreground">{label}</span>
        <span className="max-w-32 truncate font-semibold text-foreground">
          {display}
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-60">
        {allValue === undefined ? <SelectItem value={ALL}>All</SelectItem> : null}
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {labelMap?.[opt] ?? opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  return DEPARTMENT_CHIP_CLASSES[Math.abs(hash) % DEPARTMENT_CHIP_CLASSES.length];
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
        <DropdownMenuItem variant="destructive" onSelect={() => onStatus("rejected")}>
          <XCircle className="size-4" />
          Reject
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onStatus("active")}>
          <RotateCcw className="size-4" />
          Reactivate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onTogglePool}>
          <Star className="size-4" />
          Add to Pool
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
