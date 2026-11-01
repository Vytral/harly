"use client";

import { Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDate } from "./DocumentShared";
import { formatDocumentSize, type DocumentVersionItem } from "./shared";

/** Every stored version, newest first, each with its own download. */
export function DocumentVersionsPanel({
  documentId,
  versions,
  canUpload,
  lockedReason,
  onUpload,
}: {
  documentId: string;
  versions: DocumentVersionItem[];
  /** The viewer may add a version (manage rights, not archived). */
  canUpload: boolean;
  /** Why a new version cannot be added right now, shown instead of a dead button. */
  lockedReason: string | null;
  onUpload: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-soft-ink">
          {versions.length} version{versions.length === 1 ? "" : "s"}. Older versions stay available for audit.
        </p>
        {canUpload ? (
          <Button size="sm" variant="outline" disabled={Boolean(lockedReason)} onClick={onUpload}>
            <Upload />
            New version
          </Button>
        ) : null}
      </div>
      {canUpload && lockedReason ? <p className="text-[12.5px] text-soft-ink">{lockedReason}</p> : null}
      <ul className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-inner)] bg-card-inset">
        {versions.map((version) => (
          <li key={version.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span className="w-9 shrink-0 font-display text-[17px] tabular-nums text-near-ink">
              v{version.versionNumber}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-near-ink">
                {formatDate(version.createdAt)}
                {version.uploadedByName ? ` · ${version.uploadedByName}` : ""}
              </p>
              <p className="truncate text-[12px] text-soft-ink">
                {formatDocumentSize(version.sizeBytes)} · {version.checksum.slice(0, 10)}…
              </p>
            </div>
            {version.isCurrent ? (
              <StatusPill size="sm" tone="accent">
                Current
              </StatusPill>
            ) : null}
            <Button size="icon-sm" variant="ghost" asChild>
              <a
                href={`/api/documents/${documentId}/versions/${version.versionNumber}`}
                aria-label={`Download version ${version.versionNumber}`}
              >
                <Download />
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
