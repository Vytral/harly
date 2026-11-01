"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import {
  Archive,
  ArchiveRestore,
  BellRing,
  ChevronDown,
  Download,
  FileText,
  Gavel,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "@/lib/notification-island/toast";
import type { SignatureTimeline as SignatureTimelineData } from "@/lib/esign/native/timeline";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { InfoRow, InfoRows } from "@/components/ui/info-row";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingRow, SettingRows } from "@/components/ui/setting-row";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { DocxViewer } from "@/features/candidates/DocxViewer";
import { PdfViewer } from "@/features/candidates/PdfViewer";
import {
  assignDocument,
  deleteDocument,
  setDocumentCategory,
  setDocumentExpiresAt,
  setDocumentStatus,
} from "./actions";
import {
  LegalHoldDialog,
  RecordOfflineSignatureDialog,
  RenameDialog,
  SendForSignatureDialog,
  VoidSignatureDialog,
} from "./DocumentDetailDialogs";
import { DocumentFieldPlacementDialog } from "./DocumentFieldPlacementDialog";
import {
  AccessDialog,
  UploadDialog,
  formatActivityType,
  formatDate,
} from "./DocumentShared";
import { DocumentVersionsPanel } from "./DocumentVersionsPanel";
import { SignatureStatusCard, useSignerActions } from "./SignatureStatusCard";
import {
  describeExpiry,
  documentStateMeta,
  documentTypeLabel,
  formatDocumentSize,
  isPreviewable,
  type DocumentDetailBundle,
} from "./shared";

const TONE_TO_PILL = {
  neutral: "neutral",
  success: "success",
  warning: "warning",
  danger: "danger",
} as const;

function DocumentPreview({ document }: { document: DocumentDetailBundle["document"] }) {
  const url = `/api/documents/${document.id}`;
  if (document.mimeType === "application/pdf")
    return (
      <PdfViewer
        fileUrl={url}
        fileName={document.name}
        className="min-h-[70vh]"
      />
    );
  if (
    document.mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return <DocxViewer fileUrl={url} className="min-h-[70vh]" />;
  if (document.mimeType.startsWith("image/"))
    return (
      <div className="flex min-h-[70vh] items-center justify-center rounded-[var(--radius-inner)] bg-card-inset p-4">
        <img
          src={url}
          alt={document.name}
          className="max-h-[70vh] max-w-full rounded-md object-contain"
        />
      </div>
    );
  return (
    <div className="flex min-h-40 items-center justify-center rounded-[var(--radius-inner)] bg-card-inset text-sm text-soft-ink">
      Preview is not available for this file type.
    </div>
  );
}

function ExpiresAtField({
  document,
  editable,
}: {
  document: DocumentDetailBundle["document"];
  editable: boolean;
}) {
  const router = useRouter();
  const saved = document.expiresAt ? document.expiresAt.slice(0, 10) : "";
  const [value, setValue] = useState(saved);
  const [isPending, startTransition] = useTransition();
  const dirty = value !== saved;
  const hint = describeExpiry(document.expiresAt);
  function save(next: string) {
    startTransition(async () => {
      const result = await setDocumentExpiresAt({
        documentId: document.id,
        expiresAt: next || null,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save the date.");
        return;
      }
      setValue(next);
      toast.success(next ? "Date saved" : "Date cleared");
      router.refresh();
    });
  }
  return (
    <div className="space-y-1.5 sm:text-right">
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Input
          type="date"
          aria-label="Expiration date"
          value={value}
          disabled={!editable || isPending}
          onChange={(event) => setValue(event.target.value)}
          className="h-8 w-40"
        />
        {dirty ? (
          <Button size="sm" onClick={() => save(value)} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        ) : saved && editable ? (
          <Button size="sm" variant="ghost" onClick={() => save("")} disabled={isPending}>
            Clear
          </Button>
        ) : null}
      </div>
      {hint && !dirty ? (
        <p className={`text-[12px] ${hint.tone === "danger" ? "text-danger-rust" : hint.tone === "warning" ? "text-warning-clay" : "text-soft-ink"}`}>
          {hint.days < 0 ? `Passed ${hint.label}` : `Expires ${hint.label}`}
        </p>
      ) : null}
    </div>
  );
}

export function DocumentDetailView({
  bundle,
  documentsHref = "/dashboard/documents",
  signatureTimeline = null,
}: {
  bundle: DocumentDetailBundle;
  documentsHref?: string;
  signatureTimeline?: SignatureTimelineData | null;
}) {
  const { data, document, versions, signature } = bundle;
  const router = useRouter();
  const confirm = useConfirm();
  const signerActions = useSignerActions(document);
  const [renameOpen, setRenameOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [sendSignOpen, setSendSignOpen] = useState(false);
  const [nativeSendOpen, setNativeSendOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [tab, setTab] = useState("preview");
  const [isPending, startTransition] = useTransition();

  const state = documentStateMeta(document);
  const isArchived = document.status === "archived";
  const activeHolds = document.legalHolds.filter((hold) => !hold.releasedAt);
  const activeHold = activeHolds[0] ?? null;

  // A user can have the org-wide "manage documents" permission yet still be
  // narrowed out of THIS document by an explicit ACL rule — surface that
  // distinction instead of letting mutation actions fail with a vague error.
  const restrictedByAcl = data.canManage && document.currentAccessLevel !== "manage";
  const canManageThis = data.canManage && document.currentAccessLevel === "manage";
  const status = document.signatureStatus;
  const canStartSignature = canManageThis && !isArchived && (status === "unsigned" || status === "declined" || status === "expired");
  const nativeChannel = data.remoteSignEnabled;
  const docusealChannel = data.esign.connected;
  const isPdf = document.mimeType === "application/pdf";
  const currentSigner = signature?.signers.find((signer) => signer.state === "invited") ?? null;
  const signedCount = signature?.signers.filter((signer) => signer.state === "signed").length ?? 0;
  const versionLocked =
    status === "signed" || status === "pending"
      ? status === "signed"
        ? "Signed documents are final. Upload the revised file as a new document."
        : "A signature request is in progress. Void it before uploading a new version."
      : null;

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "Could not update document.");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }
  async function deleteCurrentDocument() {
    if (
      !data.canDelete ||
      !(await confirm({
        tone: "destructive",
        title: `Delete “${document.name}” permanently?`,
        description: "The document and its version history are removed for everyone. This cannot be undone.",
        confirmLabel: "Delete document",
      }))
    )
      return;
    startTransition(async () => {
      const result = await deleteDocument({ documentId: document.id });
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete document.");
        return;
      }
      toast.success("Document deleted");
      router.push(documentsHref as Route);
    });
  }
  const assignmentFor = (assignmentType: "owner" | "reviewer") =>
    document.assignments.find((assignment) => assignment.assignmentType === assignmentType)?.userId ?? "none";

  const sendChannels = [
    ...(nativeChannel ? [{ key: "native", label: "Send for signature", run: () => setNativeSendOpen(true) }] : []),
    ...(docusealChannel ? [{ key: "docuseal", label: "Send with DocuSeal", run: () => setSendSignOpen(true) }] : []),
  ];
  const signNow = () => router.push(`/dashboard/documents/${document.id}/sign` as Route);

  // One primary action, driven by the document's state.
  let primary: React.ReactNode = null;
  const sendLabel = status === "unsigned" ? "Send for signature" : "Send again";
  const startOptions = sendChannels.length + (isPdf ? 1 : 0);
  if (canStartSignature && startOptions === 1) {
    primary = sendChannels[0] ? (
      <Button onClick={sendChannels[0].run}>
        <Send />
        {sendLabel}
      </Button>
    ) : (
      <Button onClick={signNow}>
        <LockKeyhole />
        Sign myself
      </Button>
    );
  } else if (canStartSignature && startOptions > 1) {
    primary = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <Send />
            {sendLabel}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {sendChannels.map((channel) => (
            <DropdownMenuItem key={channel.key} onSelect={channel.run}>
              {channel.label}
            </DropdownMenuItem>
          ))}
          {isPdf ? (
            <DropdownMenuItem onSelect={signNow}>
              <LockKeyhole />
              Sign myself
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  } else if (canManageThis && !isArchived && status === "pending" && document.signatureProvider === "native" && currentSigner) {
    primary = (
      <Button disabled={signerActions.busyId === currentSigner.id} onClick={() => signerActions.remind(currentSigner)}>
        <BellRing />
        Remind {currentSigner.name.split(" ")[0]}
      </Button>
    );
  } else if (canManageThis && !isArchived && status === "pending") {
    primary = (
      <Button variant="outline" onClick={() => setVoidOpen(true)}>
        Void request
      </Button>
    );
  } else {
    primary = (
      <Button variant={status === "signed" ? "default" : "outline"} asChild>
        <a href={`/api/documents/${document.id}?download=1`}>
          <Download />
          {status === "signed" ? "Download signed copy" : "Download"}
        </a>
      </Button>
    );
  }

  const overflow = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="More actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <a href={`/api/documents/${document.id}?download=1`}>
            <Download />
            Download
          </a>
        </DropdownMenuItem>
        {canManageThis ? (
          <>
            <DropdownMenuItem disabled={isArchived} onSelect={() => setRenameOpen(true)}>
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isArchived || Boolean(versionLocked)} onSelect={() => setVersionOpen(true)}>
              <Upload />
              Upload new version
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isPending}
              onSelect={() =>
                run(
                  () => setDocumentStatus({ documentId: document.id, status: isArchived ? "active" : "archived" }),
                  isArchived ? "Document restored" : "Document archived",
                )
              }
            >
              {isArchived ? <ArchiveRestore /> : <Archive />}
              {isArchived ? "Restore" : "Archive"}
            </DropdownMenuItem>
          </>
        ) : null}
        {data.canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={isPending} onSelect={() => void deleteCurrentDocument()}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-5 duration-500 animate-in fade-in slide-in-from-bottom-1">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={documentsHref as Route}>Documents</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-[40ch] truncate">{document.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={document.name}
        titleBadge={
          <StatusPill tone={TONE_TO_PILL[state.tone]}>{state.label}</StatusPill>
        }
        description={`${documentTypeLabel(document.mimeType)} · ${formatDocumentSize(document.sizeBytes)} · v${document.currentVersion}${document.category ? ` · ${document.category.name}` : ""}`}
        actions={
          <>
            {primary}
            {overflow}
          </>
        }
      />

      {restrictedByAcl ? (
        <Callout tone="warning" icon={<ShieldAlert />}>
          An access rule limits you to read-only on this document, so management
          actions are unavailable even though you can manage documents in general.
        </Callout>
      ) : null}
      {activeHolds.length > 0 ? (
        <Callout tone="warning" icon={<Gavel />} title="This document is under legal hold">
          {activeHolds.map((hold) => hold.reason).join(" · ")}. It cannot be archived until every hold is released.
        </Callout>
      ) : null}
      {isArchived ? (
        <Callout tone="info" icon={<Archive />}>
          Archived documents are read-only. Restore it from the menu to edit or send it.
        </Callout>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
        <div className="lg:col-start-2 lg:row-start-1">
          <SignatureStatusCard
            data={data}
            document={document}
            signature={signature}
            canManage={canManageThis}
            archived={isArchived}
            onSendNative={() => setNativeSendOpen(true)}
            onSendDocuSeal={() => setSendSignOpen(true)}
            onVoid={() => setVoidOpen(true)}
            onRecordOffline={() => setOfflineOpen(true)}
            onSignNow={signNow}
            timeline={signatureTimeline}
          />
        </div>

        <Card className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList
                variant="line"
                className="w-full justify-start gap-5 border-b border-hairline [&>button]:flex-none [&>button]:px-0.5"
              >
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
                <TabsTrigger value="activity">Activity ({document.activity.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="mt-4">
                {isPreviewable(document.mimeType) ? (
                  <DocumentPreview document={document} />
                ) : (
                  <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-[var(--radius-inner)] bg-card-inset text-sm text-soft-ink">
                    <FileText className="size-6" />
                    Preview is not available for this file type.
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/api/documents/${document.id}?download=1`}>
                        <Download />
                        Download
                      </a>
                    </Button>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="versions" className="mt-4">
                <DocumentVersionsPanel
                  documentId={document.id}
                  versions={versions}
                  canUpload={canManageThis && !isArchived}
                  lockedReason={versionLocked}
                  onUpload={() => setVersionOpen(true)}
                />
              </TabsContent>
              <TabsContent value="activity" className="mt-4">
                {document.activity.length === 0 ? (
                  <p className="py-6 text-center text-sm text-soft-ink">No activity yet.</p>
                ) : (
                  <ul className="divide-y divide-hairline">
                    {document.activity.map((event) => (
                      <li key={event.id} className="py-3 text-sm first:pt-0 last:pb-0">
                        <p className="font-medium text-near-ink">{formatActivityType(event.type)}</p>
                        <p className="mt-0.5 text-xs text-soft-ink">
                          {event.actorName ?? "System"} · {formatDate(event.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="space-y-5 lg:col-start-2 lg:row-start-2">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRows>
                <InfoRow label="Linked to" value={document.associationLabels.join(" · ") || "Workspace"} />
                <InfoRow
                  label="Owner"
                  value={
                    document.ownerId ? (
                      <span className="inline-flex items-center gap-2">
                        <UserAvatar name={document.ownerName ?? "Workspace"} src={document.ownerImage} size="sm" />
                        {document.ownerName}
                      </span>
                    ) : (
                      "Workspace"
                    )
                  }
                />
                <InfoRow label="Updated" value={formatDate(document.updatedAt)} />
                <InfoRow label="Checksum" value={<span className="font-mono text-[12px]" title={document.checksum}>{document.checksum.slice(0, 12)}…</span>} />
              </InfoRows>
            </CardContent>
            <SettingRows className="border-t border-hairline">
              <SettingRow
                title="Category"
                control={
                  <Select
                    value={document.category?.id ?? "none"}
                    disabled={!canManageThis || isArchived || isPending}
                    onValueChange={(value) =>
                      run(
                        () => setDocumentCategory({ documentId: document.id, categoryId: value === "none" ? null : value }),
                        "Category updated",
                      )
                    }
                  >
                    <SelectTrigger size="sm" className="w-44" aria-label="Category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="end">
                      <SelectItem value="none">No category</SelectItem>
                      {data.categories
                        .filter((category) => category.active)
                        .map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                }
              />
              <SettingRow
                title="Effective / expiration date"
                description="A reminder date for the paperwork itself, separate from the signature."
                align="start"
                control={<ExpiresAtField document={document} editable={canManageThis && !isArchived} />}
              />
            </SettingRows>
          </Card>

          <Card className="gap-0 py-2">
            <CardHeader className="pt-3 pb-1">
              <CardTitle>People</CardTitle>
            </CardHeader>
            <SettingRows>
              {(["owner", "reviewer"] as const).map((assignmentType) => (
                <SettingRow
                  key={assignmentType}
                  title={assignmentType === "owner" ? "Responsible" : "Reviewer"}
                  control={
                    <Select
                      value={assignmentFor(assignmentType)}
                      disabled={!canManageThis || isArchived || isPending}
                      onValueChange={(value) =>
                        run(
                          () =>
                            assignDocument({
                              documentId: document.id,
                              userId: value === "none" ? null : value,
                              assignmentType,
                            }),
                          `${assignmentType === "owner" ? "Responsible" : "Reviewer"} updated`,
                        )
                      }
                    >
                      <SelectTrigger size="sm" className="w-44" aria-label={assignmentType === "owner" ? "Responsible" : "Reviewer"}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" align="end" className="max-h-64">
                        <SelectItem value="none">Not assigned</SelectItem>
                        {data.members.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
              ))}
            </SettingRows>
          </Card>

          <Card className="gap-0 py-2">
            <SettingRow
              icon={<ShieldCheck />}
              title="Access"
              description={
                document.accessRoles.length + document.accessMembers.length === 0
                  ? "Follows the workspace Documents permission."
                  : `${document.accessRoles.length + document.accessMembers.length} explicit rule${document.accessRoles.length + document.accessMembers.length === 1 ? "" : "s"}. The owner and admins always keep access.`
              }
              control={
                data.canShare ? (
                  <Button size="sm" variant="outline" disabled={isArchived} onClick={() => setAccessOpen(true)}>
                    <Users />
                    Manage
                  </Button>
                ) : undefined
              }
            />
          </Card>

          <details className="group rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-card)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[15px] font-semibold tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <Gavel className="size-4 text-soft-ink" />
                Governance
              </span>
              <span className="flex items-center gap-2">
                {activeHolds.length > 0 ? (
                  <StatusPill size="sm" tone="warning">
                    {activeHolds.length} hold{activeHolds.length === 1 ? "" : "s"}
                  </StatusPill>
                ) : null}
                <ChevronDown className="size-4 text-soft-ink transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div className="space-y-3 px-5 pb-5">
              <p className="text-[12.5px] leading-snug text-soft-ink">
                Preservation notices and signed evidence stay workspace-scoped and ACL-protected.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/documents/${document.id}/evidence`}>
                    <Download />
                    Export evidence
                  </a>
                </Button>
                {canManageThis ? (
                  <Button size="sm" variant="outline" disabled={isArchived && !activeHold} onClick={() => setHoldOpen(true)}>
                    <Gavel />
                    {activeHold ? "Release legal hold" : "Place legal hold"}
                  </Button>
                ) : null}
              </div>
              {activeHolds.length > 0 ? (
                <ul className="space-y-1.5 text-[12.5px] text-soft-ink">
                  {activeHolds.map((hold) => (
                    <li key={hold.id} className="rounded-[var(--radius-inner)] bg-card-inset px-3 py-2">
                      {hold.reason}
                      {hold.reference ? <span className="block text-quiet-mist">Ref {hold.reference}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      <RenameDialog key={document.name} document={document} open={renameOpen} onOpenChange={setRenameOpen} />
      <AccessDialog data={data} document={document} open={accessOpen} onOpenChange={setAccessOpen} />
      <UploadDialog data={data} open={versionOpen} onOpenChange={setVersionOpen} replaceDocument={document} />
      <SendForSignatureDialog data={data} document={document} open={sendSignOpen} onOpenChange={setSendSignOpen} />
      <DocumentFieldPlacementDialog document={document} open={nativeSendOpen} onOpenChange={setNativeSendOpen} />
      <VoidSignatureDialog document={document} signedCount={signedCount} open={voidOpen} onOpenChange={setVoidOpen} />
      <LegalHoldDialog document={document} activeHold={activeHold} open={holdOpen} onOpenChange={setHoldOpen} />
      <RecordOfflineSignatureDialog document={document} open={offlineOpen} onOpenChange={setOfflineOpen} />
    </div>
  );
}
