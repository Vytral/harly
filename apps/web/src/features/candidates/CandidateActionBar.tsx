"use client";

import type { ComponentType } from "react";
import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileText,
  Mail,
  Pencil,
  RotateCcw,
  Trash2,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";

import {
  EditCandidateDrawer,
  type EditableCandidate,
} from "@/features/candidates/EditCandidateDrawer";
import {
  EmailDrawer,
  type EmailTemplateOption,
} from "@/features/candidates/EmailDrawer";
import type { TemplateValues } from "@/features/email-templates/interpolate";
import { EvaluationDrawer } from "@/features/candidates/EvaluationDrawer";
import {
  MoveStageButton,
  type MoveStageTarget,
} from "@/features/candidates/MoveStageButton";
import { PdfViewer } from "@/features/candidates/PdfViewer";
import { ProhibitIcon } from "@/components/ui/icons/phosphor";
import {
  ScheduleDrawer,
  type ScheduleApplicationOption,
  type ScheduleCalConfig,
  type ScheduleMemberOption,
} from "@/features/candidates/ScheduleDrawer";
import {
  bulkUpdateCandidateStatusAction,
  restoreCandidateAction,
  trashCandidateAction,
} from "@/features/candidates/actions";
import { CandidatePoolButton } from "@/features/pool/CandidatePoolButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function isPdfResume(url: string, fileType: string | null, fileName: string | null) {
  return (
    fileType === "application/pdf" ||
    (fileName ?? url).toLowerCase().endsWith(".pdf")
  );
}

type CandidateStatus = "active" | "hired" | "rejected" | "withdrawn";

// Reject / withdraw live in their own prominent RejectButton; this menu covers
// the remaining lifecycle transitions.
const STATUS_ACTIONS: Array<{
  status: CandidateStatus;
  label: string;
  icon: ComponentType<{ className?: string }>;
  confirm: string;
  destructive?: boolean;
}> = [
  {
    status: "hired",
    label: "Mark as hired",
    icon: CheckCircle2,
    confirm: "Mark {name} as hired? This updates every active application.",
  },
  {
    status: "active",
    label: "Reactivate",
    icon: RotateCcw,
    confirm: "Reactivate {name}? Their applications return to the active pipeline.",
  },
];

/**
 * Prominent, isolated reject control (rust) with a split dropdown for
 * "withdrawn". Mirrors the Workable red reject button + reason menu.
 */
function RejectButton({
  name,
  applicationIds,
  compact = false,
}: {
  name: string;
  applicationIds: string[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(status: "rejected" | "withdrawn", pastTense: string) {
    if (applicationIds.length === 0) {
      toast.error("This candidate has no application to update.");
      return;
    }
    startTransition(async () => {
      const result = await bulkUpdateCandidateStatusAction({
        applicationIds,
        status,
      });
      if (result.success) {
        toast.success(`${name} ${pastTense}.`);
        (router as { refresh?: () => void }).refresh?.();
      } else {
        toast.error(result.error ?? "Could not update candidate.");
      }
    });
  }

  return (
    <div className="flex items-center">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => run("rejected", "rejected")}
        className="rounded-r-none border-destructive/30 text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
        title="Reject candidate"
      >
        <ProhibitIcon className="size-4" />
        {compact ? <span className="sr-only">Reject</span> : "Reject"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            className="rounded-l-none border-l-0 border-destructive/30 px-1.5 text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
            title="More reject options"
          >
            <ChevronDown className="size-4" />
            <span className="sr-only">Reject options</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => run("rejected", "rejected")}
          >
            <ProhibitIcon className="size-4" />
            Reject candidate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run("withdrawn", "withdrawn")}>
            <UserMinus className="size-4" />
            Mark withdrawn
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function CandidateStatusMenu({
  name,
  applicationIds,
}: {
  name: string;
  applicationIds: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(status: CandidateStatus, label: string, confirmMessage: string) {
    if (applicationIds.length === 0) {
      toast.error("This candidate has no application to update.");
      return;
    }
    if (!window.confirm(confirmMessage.replace("{name}", name))) return;

    startTransition(async () => {
      const result = await bulkUpdateCandidateStatusAction({
        applicationIds,
        status,
      });
      if (result.success) {
        toast.success(`${name} ${label.toLowerCase()}.`);
        (router as { refresh?: () => void }).refresh?.();
      } else {
        toast.error(result.error ?? "Could not update candidate status.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={isPending}>
          Status
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {STATUS_ACTIONS.map(({ status, label, icon: Icon, confirm, destructive }) => (
          <DropdownMenuItem
            key={status}
            variant={destructive ? "destructive" : "default"}
            onSelect={() => handleSelect(status, label, confirm)}
          >
            <Icon className="size-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeleteCandidateButton({
  candidateId,
  name,
  trigger,
}: {
  candidateId: string;
  name: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function deleteCandidate() {
    startTransition(async () => {
      const result = await trashCandidateAction(candidateId);
      if (!result.success) {
        toast.error(result.error ?? "Could not delete candidate.");
        return;
      }
      setConfirmOpen(false);
      toast.success(`${name} moved to trash.`, {
        action: {
          label: "Undo",
          onClick: () => {
            startTransition(async () => {
              await restoreCandidateAction(candidateId);
              (router as { refresh?: () => void }).refresh?.();
            });
          },
        },
      });
      router.push("/dashboard/candidates");
    });
  }

  return (
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
            <Trash2 className="size-4" />
            Delete
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete candidate?</DialogTitle>
          <DialogDescription>
            {name} will be moved to the trash. You can restore them later, or
            delete permanently from the Trash tab on the candidates list.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={deleteCandidate} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete candidate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CandidateActionBar({
  candidate,
  name,
  resumeUrl,
  resumeFileName = null,
  resumeFileType = null,
  stageName,
  applications,
  members,
  cal,
  move,
  emailTemplates = [],
  emailTemplateValues = {},
  inPool = false,
  variant = "full",
  aiConfigured = false,
}: {
  candidate: EditableCandidate;
  name: string;
  resumeUrl: string | null;
  resumeFileName?: string | null;
  resumeFileType?: string | null;
  stageName: string | null;
  applications: ScheduleApplicationOption[];
  members: ScheduleMemberOption[];
  cal: ScheduleCalConfig;
  move: MoveStageTarget | null;
  emailTemplates?: EmailTemplateOption[];
  emailTemplateValues?: TemplateValues;
  inPool?: boolean;
  variant?: "full" | "compact";
  aiConfigured?: boolean;
}) {
  const applicationIds = applications.map((application) => application.applicationId);

  const email = (
    <EmailDrawer
      candidateId={candidate.id}
      workspaceId={candidate.workspaceId}
      email={candidate.email}
      name={name}
      templates={emailTemplates}
      templateValues={emailTemplateValues}
      aiConfigured={aiConfigured}
      trigger={
        variant === "compact" ? (
          <Button size="sm" variant="ghost" className="size-8 p-0 text-muted-foreground hover:text-foreground" title="Email">
            <Mail className="size-4" />
            <span className="sr-only">Email</span>
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <Mail className="size-4" />
            Email
          </Button>
        )
      }
    />
  );

  const schedule = (
    <ScheduleDrawer
      candidateId={candidate.id}
      workspaceId={candidate.workspaceId}
      candidateName={name}
      candidateEmail={candidate.email}
      applications={applications}
      members={members}
      cal={cal}
      trigger={
        variant === "compact" ? (
          <Button size="sm" variant="ghost" className="size-8 p-0 text-muted-foreground hover:text-foreground" title="Schedule">
            <CalendarClock className="size-4" />
            <span className="sr-only">Schedule</span>
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <CalendarClock className="size-4" />
            Schedule
          </Button>
        )
      }
    />
  );

  const evaluate = (
    <EvaluationDrawer
      candidateId={candidate.id}
      workspaceId={candidate.workspaceId}
      stageName={stageName}
      trigger={
        variant === "compact" ? (
          <Button size="sm" variant="ghost" className="size-8 p-0 text-muted-foreground hover:text-foreground" title="Evaluate">
            <ClipboardCheck className="size-4" />
            <span className="sr-only">Evaluate</span>
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <ClipboardCheck className="size-4" />
            Evaluate
          </Button>
        )
      }
    />
  );

  const isHired = applications.some((app) => app.status === "hired");
  const reject = isHired ? null : (
    <RejectButton
      name={name}
      applicationIds={applicationIds}
      compact={variant === "compact"}
    />
  );
  const moveTarget = isHired ? null : move;

  // ── Compact (sticky bar): fast-path actions only ──
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5">
        {email}
        {schedule}
        {evaluate}
        {reject}
        <MoveStageButton target={moveTarget} />
      </div>
    );
  }

  // ── Full (header card) ──
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {/* Primary , advance the pipeline */}
      <MoveStageButton target={moveTarget} />

      {/* Communication */}
      <div className="flex items-center gap-2">
        {email}
        {schedule}
        {evaluate}
      </div>

      {/* Status + pool */}
      <div className="flex items-center gap-2 sm:border-l sm:border-border/70 sm:pl-2">
        <CandidateStatusMenu name={name} applicationIds={applicationIds} />
        <CandidatePoolButton candidateId={candidate.id} inPool={inPool} />
      </div>

      {/* Utilities , compact icons */}
      <div className="flex items-center gap-1 sm:border-l sm:border-border/70 sm:pl-2">
        <EditCandidateDrawer
          candidate={candidate}
          trigger={
            <Button size="sm" variant="ghost" className="size-8 p-0 text-muted-foreground hover:text-foreground" title="Edit candidate">
              <Pencil className="size-4" />
              <span className="sr-only">Edit</span>
            </Button>
          }
        />
        {resumeUrl ? (
          isPdfResume(resumeUrl, resumeFileType, resumeFileName) ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="size-8 p-0 text-muted-foreground hover:text-foreground" title="View resume">
                  <FileText className="size-4" />
                  <span className="sr-only">Resume</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between gap-3 pr-8">
                    <span className="truncate">{resumeFileName ?? `${name}'s resume`}</span>
                    <Button asChild size="sm" variant="outline">
                      <a href={resumeUrl} target="_blank" rel="noreferrer">
                        <Download className="size-4" />
                        Download
                      </a>
                    </Button>
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Resume preview for {name}
                  </DialogDescription>
                </DialogHeader>
                <PdfViewer
                  fileUrl={resumeUrl}
                  fileName={resumeFileName}
                  className="h-[75vh]"
                />
              </DialogContent>
            </Dialog>
          ) : (
            <Button asChild size="sm" variant="ghost" className="size-8 p-0 text-muted-foreground hover:text-foreground" title="View resume">
              <a href={resumeUrl} target="_blank" rel="noreferrer">
                <FileText className="size-4" />
                <span className="sr-only">Resume</span>
              </a>
            </Button>
          )
        ) : null}
      </div>

      {/* Reject , prominent, isolated */}
      {reject && (
        <div className="flex items-center sm:border-l sm:border-border/70 sm:pl-2">
          {reject}
        </div>
      )}

      {/* Destructive , far right so it can't be hit by accident */}
      {!isHired && (
        <div className="ml-auto flex items-center sm:ml-1 sm:border-l sm:border-border/70 sm:pl-2">
          <DeleteCandidateButton
            candidateId={candidate.id}
            name={name}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                className="size-8 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Delete candidate"
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Delete</span>
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
