"use client";

import { Fragment, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";

import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import {
  AuditDuotoneIcon,
  CaretDownIcon,
  CheckIcon,
  CopyIcon,
  DownloadDuotoneIcon,
  SearchIcon,
} from "@/components/ui/icons/phosphor";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Severity = "info" | "warning" | "critical";

type AuditLogRow = {
  id: string;
  actorEmail: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  severity: Severity;
  createdAt: string;
};

const severityStyle: Record<Severity, { dot: string; active: string }> = {
  info: { dot: "bg-muted-foreground/50", active: "bg-muted text-foreground" },
  warning: { dot: "bg-clay", active: "bg-clay/15 text-clay" },
  critical: {
    dot: "bg-destructive",
    active: "bg-destructive/10 text-destructive",
  },
};

const SEVERITY_ORDER: Severity[] = ["critical", "warning", "info"];

function SeverityBadge({ severity }: { severity: Severity }) {
  const s = severityStyle[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        s.active,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {severity}
    </span>
  );
}

/** Small copy-to-clipboard affordance for IDs and metadata blobs. */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
    >
      {copied ? (
        <CheckIcon className="size-3" />
      ) : (
        <CopyIcon className="size-3" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function AuditLogsCard({
  logs,
  canExport = false,
}: {
  logs: AuditLogRow[];
  canExport?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { info: 0, warning: 0, critical: 0 };
    for (const l of logs) c[l.severity]++;
    return c;
  }, [logs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (severityFilter !== "all" && l.severity !== severityFilter)
        return false;
      if (!q) return true;
      return (
        l.action.toLowerCase().includes(q) ||
        (l.actorEmail ?? "").toLowerCase().includes(q) ||
        (l.ipAddress ?? "").includes(q) ||
        (l.resourceType ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, query, severityFilter]);

  const hasFilter = Boolean(query) || severityFilter !== "all";
  const exportParams = new URLSearchParams();
  if (query.trim()) exportParams.set("q", query.trim());
  if (severityFilter !== "all") exportParams.set("severity", severityFilter);
  const exportHref = `/api/security/audit-logs/export${exportParams.size ? `?${exportParams.toString()}` : ""}`;
  const jsonExportParams = new URLSearchParams(exportParams);
  jsonExportParams.set("format", "json");
  const jsonExportHref = `/api/security/audit-logs/export?${jsonExportParams.toString()}`;

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={AuditDuotoneIcon}
        title="Audit Log"
        description="A workspace audit trail of security and administrative events."
        badge={
          <StatusPill tone="neutral" dot={false}>
            Last {logs.length} events
          </StatusPill>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <SearchIcon className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Filter by action, email, IP, resource…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setSeverityFilter("all")}
            className={cn(
              "rounded-md px-2.5 py-1.5 transition-colors",
              severityFilter === "all"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            All{" "}
            <span className="tabular-nums text-muted-foreground">
              {logs.length}
            </span>
          </button>
          {SEVERITY_ORDER.map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 capitalize transition-colors",
                severityFilter === sev
                  ? severityStyle[sev].active
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn("size-1.5 rounded-full", severityStyle[sev].dot)}
              />
              {sev}{" "}
              <span className="tabular-nums opacity-70">{counts[sev]}</span>
            </button>
          ))}
        </div>

        {canExport ? (
          <div className="flex items-center gap-2">
            <a href={exportHref} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-accent">
              <DownloadDuotoneIcon className="size-4" />
              CSV
            </a>
            <a href={jsonExportHref} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors hover:bg-accent">
              JSON
            </a>
          </div>
        ) : null}
      </div>

      {/* Log table */}
      <div className="overflow-hidden rounded-xl border">
        <div className="max-h-[32rem] overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
              <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="w-8 py-2.5 pl-4" />
                <th className="py-2.5 pr-4">When</th>
                <th className="py-2.5 pr-4">Action</th>
                <th className="py-2.5 pr-4">Actor</th>
                <th className="py-2.5 pr-4">IP</th>
                <th className="py-2.5 pr-4">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <AuditDuotoneIcon className="size-8 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground">
                        {hasFilter
                          ? "No matching events"
                          : "No audit events yet"}
                      </p>
                      <p className="max-w-[28ch] text-xs text-muted-foreground">
                        {hasFilter
                          ? "Try a different search term or clear the severity filter."
                          : "Security and admin actions will appear here as they happen."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((log) => {
                const expanded = expandedId === log.id;
                const hasDetail = Boolean(
                  log.userAgent || log.metadata || log.resourceId,
                );
                return (
                  <Fragment key={log.id}>
                    <tr
                      className={cn(
                        "transition-colors",
                        hasDetail && "cursor-pointer hover:bg-muted/30",
                      )}
                      onClick={() =>
                        hasDetail && setExpandedId(expanded ? null : log.id)
                      }
                    >
                      <td className="py-2.5 pl-4 align-top">
                        {hasDetail ? (
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-controls={`audit-detail-${log.id}`}
                            aria-label={
                              expanded ? "Collapse details" : "Expand details"
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(expanded ? null : log.id);
                            }}
                            className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted active:scale-95"
                          >
                            <CaretDownIcon
                              className={cn(
                                "size-3 transition-transform duration-150",
                                expanded && "rotate-180",
                              )}
                            />
                          </button>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-4 align-top font-mono text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                        <span
                          title={new Date(log.createdAt).toISOString()}
                          suppressHydrationWarning
                        >
                          {formatDistanceToNow(new Date(log.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 align-top font-mono text-xs">
                        {log.action}
                        {log.resourceType && log.resourceId ? (
                          <span className="ml-1.5 text-muted-foreground">
                            ({log.resourceType}:{log.resourceId.slice(0, 8)}…)
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-4 align-top text-xs text-muted-foreground">
                        {log.actorEmail ?? "Unknown actor"}
                      </td>
                      <td className="py-2.5 pr-4 align-top font-mono text-xs tabular-nums text-muted-foreground">
                        {log.ipAddress ?? "Not recorded"}
                      </td>
                      <td className="py-2.5 pr-4 align-top">
                        <SeverityBadge severity={log.severity} />
                      </td>
                    </tr>
                    {expanded ? (
                      <tr id={`audit-detail-${log.id}`} className="bg-muted/20">
                        <td colSpan={6} className="p-0">
                          <div className="animate-in fade-in slide-in-from-top-1 grid gap-3 px-4 py-3 duration-150 sm:grid-cols-2">
                            <div className="space-y-1">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                Full timestamp
                              </p>
                              <p className="font-mono text-xs">
                                {format(new Date(log.createdAt), "PPpp")}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                Resource
                              </p>
                              <p className="flex items-center gap-1.5 font-mono text-xs">
                                {log.resourceType ?? "Not recorded"}
                                {log.resourceId ? (
                                  <>
                                    <span className="text-muted-foreground">
                                      /
                                    </span>
                                    <span className="truncate">
                                      {log.resourceId}
                                    </span>
                                    <CopyButton value={log.resourceId} />
                                  </>
                                ) : null}
                              </p>
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                User agent
                              </p>
                              <p className="truncate font-mono text-xs text-muted-foreground">
                                {log.userAgent ?? "Unknown browser"}
                              </p>
                            </div>
                            {log.metadata ? (
                              <div className="space-y-1 sm:col-span-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Metadata
                                  </p>
                                  <CopyButton
                                    value={JSON.stringify(
                                      log.metadata,
                                      null,
                                      2,
                                    )}
                                  />
                                </div>
                                <pre className="max-h-40 overflow-auto rounded-lg border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
