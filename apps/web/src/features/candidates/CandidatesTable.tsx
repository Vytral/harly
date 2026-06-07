"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  MapPin,
  RotateCcw,
  Search,
  Sparkles,
  Tag,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { bulkUpdateCandidateStatusAction } from "@/features/candidates/actions";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { PipelineSpine } from "@/components/ui/PipelineSpine";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
};

type SortKey = "newest" | "oldest" | "name";
const ALL = "__all__";

function uniqueSorted(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort(
    (a, b) => a.localeCompare(b),
  );
}

export function CandidatesTable({ rows }: { rows: CandidateRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [dept, setDept] = useState(ALL);
  const [role, setRole] = useState(ALL);
  const [stage, setStage] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [tag, setTag] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const departments = useMemo(() => uniqueSorted(rows.map((r) => r.department)), [rows]);
  const roles = useMemo(() => uniqueSorted(rows.map((r) => r.role)), [rows]);
  const stages = useMemo(() => uniqueSorted(rows.map((r) => r.stage)), [rows]);
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
      if (tag !== ALL && !r.tags.includes(tag)) return false;
      return true;
    });

    return [...base].sort((a, b) => {
      if (sortKey === "name") return a.fullName.localeCompare(b.fullName);
      const at = a.appliedAt ?? 0;
      const bt = b.appliedAt ?? 0;
      return sortKey === "oldest" ? at - bt : bt - at;
    });
  }, [rows, query, dept, role, stage, status, tag, sortKey]);

  const filtersActive =
    dept !== ALL ||
    role !== ALL ||
    stage !== ALL ||
    status !== ALL ||
    tag !== ALL ||
    query.trim() !== "";

  function clearFilters() {
    setQuery("");
    setDept(ALL);
    setRole(ALL);
    setStage(ALL);
    setStatus(ALL);
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

  const selectedCount = filtered.filter((r) => selected.has(r.id)).length;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search candidates by name, email, role or location…"
          className="h-12 rounded-xl pl-12 text-base"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect value={dept} onChange={setDept} placeholder="Department" allLabel="All departments" options={departments} />
        <FilterSelect value={role} onChange={setRole} placeholder="Job" allLabel="All jobs" options={roles} />
        <FilterSelect value={stage} onChange={setStage} placeholder="Stage" allLabel="All stages" options={stages} />
        <FilterSelect
          value={status}
          onChange={setStatus}
          placeholder="Status"
          allLabel="All statuses"
          options={["active", "hired", "rejected", "withdrawn"]}
          labelMap={{ active: "Active", hired: "Hired", rejected: "Rejected", withdrawn: "Withdrawn" }}
        />
        {tagOptions.length > 0 ? (
          <FilterSelect
            value={tag}
            onChange={setTag}
            placeholder="Tags"
            allLabel="All tags"
            options={tagOptions}
          />
        ) : (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed px-3 text-sm text-muted-foreground/70">
            <Tag className="size-3.5" />
            No tags yet
          </span>
        )}
        {filtersActive ? (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            Clear
          </Button>
        ) : null}
      </div>

      {/* Count + sort */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{filtered.length}</span>{" "}
          {filtered.length === 1 ? "candidate" : "candidates"}
        </p>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk bar */}
      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-accent/40 px-3 py-2 duration-200 animate-in fade-in slide-in-from-top-1">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
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
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {/* List + AI rail */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card">
          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5">
            <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select all" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Candidate
            </span>
            <span className="ml-auto hidden text-xs font-medium uppercase tracking-wide text-muted-foreground sm:block">
              Job status
            </span>
          </div>

          <div className="divide-y divide-border/60">
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
                  className="group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 px-4 py-4 transition-colors hover:bg-muted/40 data-[state=selected]:bg-accent/40 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                >
                  <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleOne(row.id)}
                      aria-label={`Select ${row.fullName}`}
                    />
                  </div>

                  {/* Identity */}
                  <div className="flex min-w-0 items-start gap-3">
                    <UserAvatar name={row.fullName} src={row.avatarUrl} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground group-hover:text-primary">
                        {row.fullName}
                      </p>
                      {row.role ? (
                        <p className="truncate text-sm text-muted-foreground">{row.role}</p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {row.location ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" />
                            {row.location}
                          </span>
                        ) : null}
                        {row.source ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                            via {row.source}
                          </span>
                        ) : null}
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
                    </div>
                  </div>

                  {/* Job status */}
                  <div className="col-start-2 min-w-0 sm:col-auto">
                    {row.stage ? (
                      <>
                        <p className="text-xs font-medium text-foreground">{row.stage}</p>
                        <PipelineSpine current={row.stage} className="mt-1.5 max-w-40" />
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No application</p>
                    )}
                    {row.appliedLabel ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">{row.appliedLabel}</p>
                    ) : null}
                  </div>

                  {/* Status */}
                  <div className="col-start-2 sm:col-auto sm:self-center">
                    {row.status ? <ApplicationStatusBadge status={row.status} /> : null}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
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

function FilterSelect({
  value,
  onChange,
  placeholder,
  allLabel,
  options,
  labelMap,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  allLabel: string;
  options: string[];
  labelMap?: Record<string, string>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className={cn("min-w-36", value !== ALL && "border-primary/40 bg-accent/40")}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {labelMap?.[opt] ?? opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
