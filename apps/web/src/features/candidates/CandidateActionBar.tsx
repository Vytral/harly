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
import { toast } from "@/lib/notification-island/toast";

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

function isPdfResume(
  url: string,
  fileType: string | null,
  fileName: string | null,
) {
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
    confirm: "Mark {name}'s application for {job} as hired?",
  },
  {
    status: "active",
    label: "Reactivate",
    icon: RotateCcw,
    confirm: "Reactivate {name}'s application for {job}?",
  },
];

export function decisionApplicationIds(
  applications: ScheduleApplicationOption[],
  selectedApplicationId: string | null,
) {
  const selected =
    applications.find(
      (application) => application.applicationId === selectedApplicationId,
    ) ?? applications[0];
  return selected ? [selected.applicationId] : [];
}

function decisionApplication(
  applications: ScheduleApplicationOption[],
  selectedApplicationId: string | null,
) {
  const selected =
    applications.find(
      (application) => application.applicationId === selectedApplicationId,
    ) ?? applications[0];
  return selected ?? null;
}

function DecisionApplicationSelector({
  applications,
  selectedApplicationId,
  onChange,
}: {
  applications: ScheduleApplicationOption[];
  selectedApplicationId: string | null;
  onChange: (applicationId: string) => void;
}) {
  if (applications.length < 2) return null;

  const selected = decisionApplication(applications, selectedApplicationId);

  return (
    <label className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-background px-2.5 py-1.5">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">
        Decide for
      </span>
      <select
        aria-label="Application to update"
        className="min-w-0 max-w-52 bg-transparent text-sm font-medium text-foreground outline-none"
        value={selected?.applicationId ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {applications.map((application) => (
          <option key={application.applicationId} value={application.applicationId}>
            {application.jobTitle}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Prominent, isolated reject control (rust) with a split dropdown for
 * "withdrawn". Mirrors the Workable red reject button + reason menu.
 */
function RejectButton({
  name,
  application,
  compact = false,
}: {
  name: string;
  application: ScheduleApplicationOption | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(status: "rejected" | "withdrawn", pastTense: string) {
    if (!application) {
      toast.error("This candidate has no application to update.");
      return;
    }
    if (
      !window.confirm(
        `${pastTense === "withdrawn" ? "Mark" : "Reject"} ${name}'s application for ${application.jobTitle}?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await bulkUpdateCandidateStatusAction({
        applicationIds: [application.applicationId],
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
  application,
}: {
  name: string;
  application: ScheduleApplicationOption | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(
    status: CandidateStatus,
    label: string,
    confirmMessage: string,
  ) {
    if (!application) {
      toast.error("This candidate has no application to update.");
      return;
    }
    if (
      !window.confirm(
        confirmMessage
          .replace("{name}", name)
          .replace("{job}", application.jobTitle),
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await bulkUpdateCandidateStatusAction({
        applicationIds: [application.applicationId],
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
        {STATUS_ACTIONS.map(
          ({ status, label, icon: Icon, confirm, destructive }) => (
            <DropdownMenuItem
              key={status}
              variant={destructive ? "destructive" : "default"}
              onSelect={() => handleSelect(status, label, confirm)}
            >
              <Icon className="size-4" />
              {label}
            </DropdownMenuItem>
          ),
        )}
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
      toast.success(`${name} deleted permanently.`);
      router.push("/dashboard/candidates");
    });
  }

  return (
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
          >
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
          <Button
            variant="outline"
            onClick={() => setConfirmOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={deleteCandidate}
            disabled={isPending}
          >
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
  moveTargets = [],
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
  moveTargets?: MoveStageTarget[];
  emailTemplates?: EmailTemplateOption[];
  emailTemplateValues?: TemplateValues;
  inPool?: boolean;
  variant?: "full" | "compact";
  aiConfigured?: boolean;
}) {
  const [selectedApplicationId, setSelectedApplicationId] = useState(
    applications[0]?.applicationId ?? null,
  );
  const selectedDecisionIds = decisionApplicationIds(
    applications,
    selectedApplicationId,
  );
  const selectedApplication =
    applications.find(
      (application) => application.applicationId === selectedDecisionIds[0],
    ) ?? null;
  const selectedMoveTarget =
    moveTargets.find(
      (target) => target.applicationId === selectedApplication?.applicationId,
    ) ?? move;
  const applicationSelector = (
    <DecisionApplicationSelector
      applications={applications}
      selectedApplicationId={selectedApplicationId}
      onChange={setSelectedApplicationId}
    />
  );

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
          <Button
            size="sm"
            variant="ghost"
            className="size-8 p-0 text-muted-foreground hover:text-foreground"
            title="Email"
          >
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
          <Button
            size="sm"
            variant="ghost"
            className="size-8 p-0 text-muted-foreground hover:text-foreground"
            title="Schedule"
          >
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

  const evaluate = selectedApplication ? (
    <EvaluationDrawer
      candidateId={candidate.id}
      workspaceId={candidate.workspaceId}
      applicationId={selectedApplication.applicationId}
      stageName={selectedApplication.currentStageName ?? stageName}
      trigger={
        variant === "compact" ? (
          <Button
            size="sm"
            variant="ghost"
            className="size-8 p-0 text-muted-foreground hover:text-foreground"
            title="Evaluate"
          >
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
  ) : null;

  const isHired = selectedApplication?.status === "hired";
  const reject = isHired ? null : (
    <RejectButton
      name={name}
      application={selectedApplication}
      compact={variant === "compact"}
    />
  );
  const moveTarget = isHired ? null : selectedMoveTarget;

  // ── Compact (sticky bar): fast-path actions only ──
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5">
        {applicationSelector}
        {email}
        {schedule}
        {evaluate}
        {reject}
        <MoveStageButton target={moveTarget} />
      </div>
    );
  }

  /*
   * ── Full (decision row) ──
   *
   * This used to be ten controls in one row: Move, Email, Schedule, Evaluate,
   * Status, Pool, Edit, Resume, Reject, Delete , separated by four vertical
   * rules. That is not power, it is surface without choreography, and it makes
   * every decision cost a scan (DESIGN.md , Candidate Focus: one primary action
   * that changes with stage, reject secondary, the rest behind an overflow).
   *
   * Shape now: [primary advance] [the one action this stage calls for] · [Reject]
   * · [⋯]. MoveStageButton is already stage-contextual , its label and target
   * read "Move to Screening", "Move to Interview" , and `stageAction` picks the
   * verb that matters at that stage.
   */
  const stageAction = stageContextualAction(stageName, {
    schedule,
    evaluate,
    email,
  });

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {/* Primary , advance the pipeline. Label and target follow the stage. */}
      <MoveStageButton target={moveTarget} />

      {/* The one action this stage actually calls for. */}
      {stageAction}

      {/* Reject , grave, adjacent to the advance it opposes, never hidden in a
          menu: an irreversible decision should cost a deliberate click, not a
          hunt. */}
      {reject}

      {/* Everything rare , status, pool, edit, resume, delete , lives here. */}
      <div className="ml-auto flex items-center gap-1">
        {applicationSelector}
        <CandidateStatusMenu
          name={name}
          application={selectedApplication}
        />
        <CandidatePoolButton candidateId={candidate.id} inPool={inPool} />
        <EditCandidateDrawer
          candidate={candidate}
          trigger={
            <Button
              size="sm"
              variant="ghost"
              className="size-8 p-0 text-muted-foreground hover:text-foreground"
              title="Edit candidate"
            >
              <Pencil className="size-4" />
              <span className="sr-only">Edit</span>
            </Button>
          }
        />
        {resumeUrl ? (
          isPdfResume(resumeUrl, resumeFileType, resumeFileName) ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="size-8 p-0 text-muted-foreground hover:text-foreground"
                  title="View resume"
                >
                  <FileText className="size-4" />
                  <span className="sr-only">Resume</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between gap-3 pr-8">
                    <span className="truncate">
                      {resumeFileName ?? `${name}'s resume`}
                    </span>
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
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="size-8 p-0 text-muted-foreground hover:text-foreground"
              title="View resume"
            >
              <a href={resumeUrl} target="_blank" rel="noreferrer">
                <FileText className="size-4" />
                <span className="sr-only">Resume</span>
              </a>
            </Button>
          )
        ) : null}

        {/* Destructive , last in the row so it can't be hit by accident. */}
        {!isHired ? (
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
        ) : null}
      </div>
    </div>
  );
}

/**
 * Which verb this stage is actually about (DESIGN.md , "Primary action changes
 * with stage"). Advancing is always available via MoveStageButton; this picks
 * the one companion action worth a full button here, instead of showing every
 * weapon at every stage.
 *
 *   Applied / Screening → Evaluate  (is this person any good?)
 *   Interview           → Schedule  (get them in a room)
 *   Offer / Hired       → Email     (talk terms)
 */
function stageContextualAction(
  stageName: string | null,
  actions: {
    schedule: React.ReactNode;
    evaluate: React.ReactNode;
    email: React.ReactNode;
  },
) {
  const stage = (stageName ?? "").toLowerCase();
  if (stage.includes("interview")) return actions.schedule;
  if (stage.includes("offer") || stage.includes("hire")) return actions.email;
  return actions.evaluate ?? actions.email;
}
