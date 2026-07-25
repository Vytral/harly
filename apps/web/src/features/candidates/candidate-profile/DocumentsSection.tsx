"use client";

import Link from "next/link";
import type { Route } from "next";
import { ExternalLink, FileText, NotebookTabs, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CandidateDocumentUploadButton } from "@/features/candidates/CandidateDocumentUpload";
import { DocumentRequestsPanel } from "@/features/candidates/DocumentRequestsPanel";
import type { DocumentRequestItem } from "@/features/documents/requests-shared";

import { EmptySection } from "./shared";
import type { RelatedDocument } from "./types";

export function DocumentsSection({
  candidateId,
  relatedDocuments,
  documentRequests,
  applications,
  canManageDocuments,
  hasSignableDocuments,
  onRequestSignature,
}: {
  candidateId: string;
  relatedDocuments: RelatedDocument[];
  documentRequests: DocumentRequestItem[];
  applications: Array<{ id: string; jobTitle: string }>;
  canManageDocuments: boolean;
  hasSignableDocuments: boolean;
  onRequestSignature: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <NotebookTabs className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Candidate documents</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              CVs and documents linked to this candidate stay visible here while
              the Documents hub remains the source of truth.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canManageDocuments ? (
            <CandidateDocumentUploadButton candidateId={candidateId} />
          ) : null}
          {canManageDocuments ? (
            <Button
              size="sm"
              onClick={onRequestSignature}
              disabled={!hasSignableDocuments}
            >
              <Send className="size-4" />
              Request signature
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link
              href={{ pathname: "/dashboard/documents", query: { candidateId } }}
            >
              Open hub
            </Link>
          </Button>
        </div>
      </div>

      {relatedDocuments.length === 0 ? (
        <EmptySection
          icon={NotebookTabs}
          title="Nothing on file for this candidate"
          hint={
            canManageDocuments
              ? "Upload a CV or contract above, or link an existing one from the Documents hub."
              : "Anything a teammate links from the Documents hub will appear here."
          }
        />
      ) : (
        <div className="divide-y rounded-xl border">
          {relatedDocuments.map((document) => (
            <Link
              key={document.id}
              href={`/dashboard/documents/${document.id}` as Route}
              className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/30"
            >
              <FileText className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{document.name}</span>
              <span className="text-xs text-muted-foreground">
                {document.mimeType === "application/pdf" ? "PDF" : "Document"}
              </span>
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      <DocumentRequestsPanel
        requests={documentRequests}
        applications={applications}
        canManage={canManageDocuments}
      />
    </>
  );
}
