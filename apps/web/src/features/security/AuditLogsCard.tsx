"use client";

import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";

import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import {
  AuditDuotoneIcon,
  SearchIcon,
} from "@/components/ui/icons/phosphor";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AuditLogRow = {
  id: string;
  actorEmail: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  severity: "info" | "warning" | "critical";
  createdAt: string;
};

const severityStyle: Record<
  "info" | "warning" | "critical",
  { pill: string; dot: string }
> = {
  info: {
    pill: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
  warning: {
    pill: "bg-clay/10 text-clay",
    dot: "bg-clay",
  },
  critical: {
    pill: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
};

function SeverityBadge({ severity }: { severity: "info" | "warning" | "critical" }) {
  const s = severityStyle[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.pill}`}
    >
      <span className={`size-1.5 rounded-full ${s.dot}`} />
      {severity}
    </span>
  );
}

export function AuditLogsCard({ logs }: { logs: AuditLogRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = query
    ? logs.filter(
        (l) =>
          l.action.includes(query.toLowerCase()) ||
          (l.actorEmail ?? "").toLowerCase().includes(query.toLowerCase()) ||
          (l.ipAddress ?? "").includes(query),
      )
    : logs;

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={AuditDuotoneIcon}
        title="Audit Log"
        description="A tamper-evident trail of security and administrative events in your workspace."
        badge={
          <StatusPill tone="neutral" dot={false}>
            Last 200 events
          </StatusPill>
        }
      />

      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Filter by action, email, or IP…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Log table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 pr-4">When</th>
              <th className="pb-2 pr-4">Action</th>
              <th className="pb-2 pr-4">Actor</th>
              <th className="pb-2 pr-4">IP</th>
              <th className="pb-2">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  {query ? "No matching events." : "No audit events yet."}
                </td>
              </tr>
            )}
            {filtered.map((log) => (
              <tr key={log.id} className="group">
                <td className="py-2.5 pr-4 align-top text-xs text-muted-foreground whitespace-nowrap">
                  <span title={format(new Date(log.createdAt), "PPpp")}>
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
                  {log.actorEmail ?? "—"}
                </td>
                <td className="py-2.5 pr-4 align-top font-mono text-xs text-muted-foreground">
                  {log.ipAddress ?? "—"}
                </td>
                <td className="py-2.5 align-top">
                  <SeverityBadge severity={log.severity} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
