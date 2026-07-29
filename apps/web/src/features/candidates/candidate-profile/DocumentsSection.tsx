"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ChevronDown,
  ExternalLink,
  FileText,
  FileUp,
  NotebookTabs,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCandidateDocumentUpload } from "@/features/candidates/CandidateDocumentUpload";
import {
  DocumentRequestsList,
  RequestDialog,
} from "@/features/candidates/DocumentRequestsPanel";
import type { DocumentRequestItem } from "@/features/documents/requests-shared";

import { EmptySection, SectionHeading } from "./shared";
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
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const upload = useCandidateDocumentUpload(candidateId);
  const canRequestDocument = applications.length > 0;

  return (
    <>
      <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <NotebookTabs className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Documents</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Files on file, and anything still awaiting upload from the
              candidate. The Documents hub remains the source of truth.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link
              href={{ pathname: "/dashboard/documents", query: { candidateId } }}
            >
              <ExternalLink className="size-4" />
              Open hub
            </Link>
          </Button>
          {canManageDocuments ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  Add
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  disabled={upload.isPending}
                  onSelect={(event) => {
                    event.preventDefault();
                    // Radix closes the menu on select; the file picker must
                    // open after that animation or some browsers swallow it.
                    setTimeout(() => upload.openPicker(), 0);
                  }}
                >
                  <FileUp />
                  {upload.isPending ? "Uploading…" : "Upload a document"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canRequestDocument}
                  title={
                    canRequestDocument
                      ? undefined
                      : "This candidate has no application to attach a request to."
                  }
                  onSelect={() => setRequestDialogOpen(true)}
                >
                  <FileText />
                  Request a document upload
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasSignableDocuments}
                  title={
                    hasSignableDocuments
                      ? undefined
                      : "Upload a signable PDF first."
                  }
                  onSelect={onRequestSignature}
                >
                  <Send />
                  Request a signature
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <input {...upload.inputProps} />
        </div>
      </div>

      <div className="space-y-2">
        <SectionHeading>On file</SectionHeading>
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
      </div>

      <DocumentRequestsList requests={documentRequests} canManage={canManageDocuments} />

      {canManageDocuments ? (
        <RequestDialog
          applications={applications}
          open={requestDialogOpen}
          onOpenChange={setRequestDialogOpen}
        />
      ) : null}
    </>
  );
}
