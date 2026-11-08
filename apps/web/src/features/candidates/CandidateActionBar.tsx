"use client";

import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import type { ComponentType, ReactNode, RefObject } from "react";
import { useRef, useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileText,
  Mail,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  UserMinus,
} from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { Badge } from "@/components/ui/badge";
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
import { CandidateStageStepper } from "@/features/candidates/CandidateStageStepper";
import { BookmarkSimpleIcon, ProhibitIcon } from "@/components/ui/icons/phosphor";
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
import { useCandidatePool } from "@/features/pool/CandidatePoolButton";
import { RejectDialog } from "@/features/rejection-reasons/RejectDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ariaKeys, withHint, type ShortcutId } from "@/components/dashboard/shortcuts/catalog";
import { usePublishCandidateActions } from "@/components/dashboard/shortcuts/candidate-actions";
import { useShortcut } from "@/components/dashboard/shortcuts/useShortcut";

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

/**
 * "Decide for" job context pill. A native select is laid transparently over
 * the pill so keyboard, screen-reader and mobile pickers keep working for
 * free; with a single application it is a static pill without the chevron.
 */
function DecisionApplicationSelector({
  applications,
  selectedApplicationId,
  onChange,
  className,
}: {
  applications: ScheduleApplicationOption[];
  selectedApplicationId: string | null;
  onChange: (applicationId: string) => void;
  className?: string;
}) {
  const selected = decisionApplication(applications, selectedApplicationId);
  if (!selected) return null;

  const pillClass =
    "inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-full border border-hairline bg-card px-3 text-[13px] font-medium text-near-ink";

  if (applications.length < 2) {
    return (
      <span className={cn(pillClass, className)} title={`Job: ${selected.jobTitle}`}>
        <Briefcase className="size-3.5 shrink-0 text-soft-ink" strokeWidth={1.8} />
        <span className="truncate">{selected.jobTitle}</span>
      </span>
    );
  }

  return (
    <label
      title="Decide for"
      className={cn(
        pillClass,
        "relative cursor-pointer transition-colors duration-150 hover:bg-card-inset focus-within:ring-[3px] focus-within:ring-ring/50",
        className,
      )}
    >
      <Briefcase className="size-3.5 shrink-0 text-soft-ink" strokeWidth={1.8} />
      <span className="truncate">{selected.jobTitle}</span>
      <ChevronDown className="size-3.5 shrink-0 text-soft-ink" strokeWidth={1.8} />
      <select
        aria-label="Application to update"
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        value={selected.applicationId}
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
 * Status mutations for one application (withdraw / hire / reactivate).
 * Hoisted so the decision bar and the ⋯ menu share one pending state and the
 * same confirm + toast behavior. Rejecting goes through RejectDialog.
 */
function useApplicationStatus(
  name: string,
  application: ScheduleApplicationOption | null,
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  async function withdraw() {
    if (!application) {
      toast.error("This candidate has no application to update.");
      return;
    }
    if (
      !(await confirm({
        tone: "warning",
        title: `Mark ${name}'s application as withdrawn?`,
        description: `Applies to ${application.jobTitle}. No rejection email is sent.`,
        confirmLabel: "Mark withdrawn",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      const result = await bulkUpdateCandidateStatusAction({
        applicationIds: [application.applicationId],
        status: "withdrawn",
      });
      if (result.success) {
        if (result.emailWarning) {
          toast.warning(`${name} withdrawn. ${result.emailWarning}`);
        } else {
          toast.success(`${name} withdrawn.`);
        }
        (router as { refresh?: () => void }).refresh?.();
      } else {
        toast.error(result.error ?? "Could not update candidate.");
      }
    });
  }

  async function change(
    status: CandidateStatus,
    label: string,
    confirmMessage: string,
  ) {
    if (!application) {
      toast.error("This candidate has no application to update.");
      return;
    }
    if (
      !(await confirm({
        title: confirmMessage
          .replace("{name}", name)
          .replace("{job}", application.jobTitle),
        description: "You can change the status again later.",
        confirmLabel: label,
      }))
    ) {
      return;
    }

    startTransition(async () => {
      const result = await bulkUpdateCandidateStatusAction({
        applicationIds: [application.applicationId],
        status,
      });
      if (result.success) {
        if (result.emailWarning) {
          toast.warning(`${name} ${label.toLowerCase()}. ${result.emailWarning}`);
        } else {
          toast.success(`${name} ${label.toLowerCase()}.`);
        }
        (router as { refresh?: () => void }).refresh?.();
      } else {
        toast.error(result.error ?? "Could not update candidate status.");
      }
    });
  }

  return { isPending, withdraw, change };
}

/** Reject: outline with rust text. Withdraw lives in the ⋯ menu. */
function RejectButton({
  onReject,
  pending,
  compact = false,
  className,
}: {
  onReject: () => void;
  pending: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={onReject}
      className={cn(
        "border-destructive/30 text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
      title={withHint("Reject candidate", "candidate.reject")}
      aria-keyshortcuts={ariaKeys("candidate.reject")}
    >
      <ProhibitIcon className="size-4" />
      {compact ? <span className="sr-only">Reject</span> : "Reject"}
    </Button>
  );
}

function DeleteCandidateDialog({
  open,
  onOpenChange,
  candidateId,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  name: string;
}) {
  const router = useRouter();

  async function deleteCandidate() {
    const result = await trashCandidateAction(candidateId);
    if (!result.success) {
      toast.error(result.error ?? "Could not delete candidate.");
      throw new Error("trash failed");
    }
    toast.success(`${name} moved to trash.`);
    router.push("/dashboard/candidates");
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="destructive"
      title={`Delete ${name}?`}
      description="They will move to the trash. You can restore them later, or delete them permanently from the Trash tab."
      confirmLabel="Move to trash"
      onConfirm={deleteCandidate}
    />
  );
}

type StageActionKey = "schedule" | "evaluate" | "email";

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
  access,
  identity,
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
  /** What the viewer may do. Omitted means everything (the server still checks). */
  access?: { canReject?: boolean; canDelete?: boolean };
  /** Full variant only: the identity block rendered at the left of row 1. */
  identity?: ReactNode;
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

  const status = useApplicationStatus(name, selectedApplication);
  const pool = useCandidatePool(candidate.id, inPool);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const scheduleRef = useRef<HTMLSpanElement>(null);
  const editRef = useRef<HTMLSpanElement>(null);
  const emailRef = useRef<HTMLSpanElement>(null);
  const evaluateRef = useRef<HTMLSpanElement>(null);
  const moveRef = useRef<HTMLSpanElement>(null);
  // Menu selections run after the menu has closed and returned focus, so a
  // drawer or dialog they open is not immediately stolen back by the trigger.
  const afterMenuClose = useRef<(() => void) | null>(null);
  const queueAfterMenu = (fn: () => void) => {
    afterMenuClose.current = fn;
  };
  const clickTrigger = (ref: RefObject<HTMLSpanElement | null>) =>
    ref.current?.querySelector("button")?.click();

  const applicationSelector = (
    <DecisionApplicationSelector
      applications={applications}
      selectedApplicationId={selectedApplicationId}
      onChange={setSelectedApplicationId}
    />
  );

  const isHired = selectedApplication?.status === "hired";
  const moveTarget = isHired ? null : selectedMoveTarget;

  /**
   * Which verb this stage is actually about (DESIGN.md , "Primary action
   * changes with stage"). Advancing is always available via MoveStageButton.
   *
   *   Applied / Screening → Evaluate  (is this person any good?)
   *   Interview           → Schedule  (get them in a room)
   *   Offer / Hired       → Email     (talk terms)
   */
  const stage = (stageName ?? "").toLowerCase();
  const stageActionKey: StageActionKey = stage.includes("interview")
    ? "schedule"
    : stage.includes("offer") || stage.includes("hire")
      ? "email"
      : selectedApplication
        ? "evaluate"
        : "email";

  const triggerButton = (
    key: StageActionKey,
    Icon: ComponentType<{ className?: string }>,
    label: string,
    shortcut?: ShortcutId,
  ) => (
    <Button
      size="sm"
      variant={key === stageActionKey && key !== "evaluate" ? "soft" : "outline"}
      className="max-sm:flex-1"
      title={shortcut ? withHint(label, shortcut) : undefined}
      aria-keyshortcuts={shortcut ? ariaKeys(shortcut) : undefined}
    >
      <Icon className="size-4" />
      {label}
    </Button>
  );

  const compactTrigger = (
    Icon: ComponentType<{ className?: string }>,
    label: string,
    shortcut?: ShortcutId,
  ) => (
    <Button
      size="sm"
      variant="ghost"
      className="hidden size-8 p-0 text-muted-foreground hover:text-foreground md:inline-flex"
      title={shortcut ? withHint(label, shortcut) : label}
      aria-keyshortcuts={shortcut ? ariaKeys(shortcut) : undefined}
    >
      <Icon className="size-4" />
      <span className="sr-only">{label}</span>
    </Button>
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
        variant === "compact"
          ? compactTrigger(Mail, "Email")
          : triggerButton("email", Mail, "Email")
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
        variant === "compact"
          ? compactTrigger(CalendarClock, "Schedule", "candidate.schedule")
          : triggerButton("schedule", CalendarClock, "Schedule", "candidate.schedule")
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
        variant === "compact"
          ? compactTrigger(ClipboardCheck, "Evaluate", "candidate.evaluate")
          : triggerButton("evaluate", ClipboardCheck, "Evaluate", "candidate.evaluate")
      }
    />
  ) : null;

  const rejectDialog = selectedApplication ? (
    <RejectDialog
      open={rejectOpen}
      onOpenChange={setRejectOpen}
      targets={[
        {
          applicationId: selectedApplication.applicationId,
          candidateName: name,
          jobTitle: selectedApplication.jobTitle,
        },
      ]}
    />
  ) : null;

  const mayReject = access?.canReject !== false;
  const mayDelete = access?.canDelete !== false;
  const reject = isHired || !mayReject ? null : (
    <RejectButton
      compact={variant === "compact"}
      pending={status.isPending}
      onReject={() => {
        if (!selectedApplication) {
          toast.error("This candidate has no application to update.");
          return;
        }
        setRejectOpen(true);
      }}
      className={variant === "compact" ? undefined : "max-sm:flex-1"}
    />
  );

  /*
   * Keyboard shortcuts and ⌘K actions. Only the full bar owns them (the sticky
   * "compact" bar is a second copy of the same buttons), and every one drives
   * the visible control: it clicks the same trigger or opens the same dialog,
   * so disabled and pending states apply exactly as for a mouse click.
   */
  const owner = variant === "full";
  const canMove = Boolean(moveTarget?.nextStage);
  const canReject = !isHired && Boolean(selectedApplication) && !status.isPending;
  const canEvaluate = Boolean(selectedApplication);
  const openMove = () => clickTrigger(moveRef);
  const openReject = () => setRejectOpen(true);
  const openEvaluate = () => clickTrigger(evaluateRef);
  const openSchedule = () => clickTrigger(scheduleRef);
  const openEmail = () => clickTrigger(emailRef);

  useShortcut("candidate.move", openMove, { enabled: owner && canMove });
  useShortcut("candidate.reject", openReject, { enabled: owner && canReject && mayReject });
  useShortcut("candidate.evaluate", openEvaluate, { enabled: owner && canEvaluate });
  useShortcut("candidate.schedule", openSchedule, { enabled: owner });

  usePublishCandidateActions(
    {
      ...(canMove && moveTarget?.nextStage
        ? { move: { label: `Move to ${moveTarget.nextStage.name}`, run: openMove } }
        : {}),
      ...(canReject && mayReject ? { reject: { label: "Reject…", run: openReject } } : {}),
      ...(canEvaluate ? { evaluate: { label: "Evaluate", run: openEvaluate } } : {}),
      schedule: { label: "Schedule interview", run: openSchedule },
      email: { label: "Email", run: openEmail },
    },
    owner,
  );

  // ── Compact (sticky bar): fast-path actions only ──
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5">
        {applicationSelector ? (
          <span className="hidden min-w-0 max-w-48 md:block">
            {applicationSelector}
          </span>
        ) : null}
        {email}
        {schedule}
        {evaluate}
        {reject}
        <MoveStageButton target={moveTarget} />
        {rejectDialog}
      </div>
    );
  }

  /*
   * ── Full: header row 1 (identity · contact actions · ⋯) + decision bar ──
   *
   * Row 1 right: Email, Schedule (≥sm) and the ⋯ menu that collects the rare
   * actions (status, withdraw, pool, edit, resume, delete). Row 2 is the
   * decision bar: job context pill, stage stepper, then Reject · the stage's
   * contextual action · the primary "Move to <next stage>".
   */
  const menuStatusItems = STATUS_ACTIONS.map(
    ({ status: next, label, icon: Icon, confirm }) => (
      <DropdownMenuItem
        key={next}
        onSelect={() => queueAfterMenu(() => status.change(next, label, confirm))}
      >
        <Icon className="size-4" />
        {label}
      </DropdownMenuItem>
    ),
  );

  const resumeIsPdf = resumeUrl
    ? isPdfResume(resumeUrl, resumeFileType, resumeFileName)
    : false;

  // Schedule / Email already sit in row 1 (emphasized for this stage); only
  // Evaluate needs its own slot in the decision bar.
  const contextual =
    stageActionKey === "evaluate" ? (
      <span ref={evaluateRef} className="contents">
        {evaluate}
      </span>
    ) : null;
  const stepperStage = selectedApplication?.currentStageName ?? stageName;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{identity}</div>

        <div className="flex shrink-0 items-center gap-2">
          <span ref={emailRef} className="contents">
            {email}
          </span>
          <span ref={scheduleRef} className="hidden sm:inline-flex">
            {schedule}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="More actions"
                title="More actions"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-52"
              onCloseAutoFocus={(event) => {
                const action = afterMenuClose.current;
                if (!action) return;
                afterMenuClose.current = null;
                event.preventDefault();
                action();
              }}
            >
              <DropdownMenuItem
                className="sm:hidden"
                onSelect={() => queueAfterMenu(() => clickTrigger(scheduleRef))}
              >
                <CalendarClock className="size-4" />
                Schedule
              </DropdownMenuItem>
              {stageActionKey !== "evaluate" && selectedApplication ? (
                <DropdownMenuItem
                  onSelect={() => queueAfterMenu(() => clickTrigger(evaluateRef))}
                >
                  <ClipboardCheck className="size-4" />
                  Evaluate
                  <DropdownMenuShortcut aria-hidden>E</DropdownMenuShortcut>
                </DropdownMenuItem>
              ) : null}
              {menuStatusItems}
              {!isHired ? (
                <DropdownMenuItem
                  onSelect={() => queueAfterMenu(() => status.withdraw())}
                >
                  <UserMinus className="size-4" />
                  Mark withdrawn
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={pool.isPending}
                onSelect={() => pool.toggle()}
              >
                <BookmarkSimpleIcon
                  className={cn("size-4", pool.inPool && "fill-current")}
                />
                {pool.inPool ? "Remove from pool" : "Add to pool"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => queueAfterMenu(() => clickTrigger(editRef))}>
                <Pencil className="size-4" />
                Edit candidate
              </DropdownMenuItem>
              {resumeUrl ? (
                <>
                  {resumeIsPdf ? (
                    <DropdownMenuItem onSelect={() => queueAfterMenu(() => setResumeOpen(true))}>
                      <FileText className="size-4" />
                      View resume
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem asChild>
                      <a href={resumeUrl} target="_blank" rel="noreferrer">
                        <FileText className="size-4" />
                        View resume
                      </a>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <a href={resumeUrl} target="_blank" rel="noreferrer" download>
                      <Download className="size-4" />
                      Download resume
                    </a>
                  </DropdownMenuItem>
                </>
              ) : null}
              {!isHired && mayDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => queueAfterMenu(() => setDeleteOpen(true))}
                  >
                    <Trash2 className="size-4" />
                    Delete candidate
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Decision bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-inner)] bg-card-inset px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3 max-sm:w-full">
          <span className="sr-only">Decide for</span>
          {applicationSelector}
          <CandidateStageStepper stageName={stepperStage} className="hidden md:flex" />
        </div>

        {isHired ? (
          <Badge variant="success" className="ml-auto">
            Hired
          </Badge>
        ) : (
          <div className="ml-auto flex items-center gap-2 max-sm:w-full">
            {reject}
            {contextual}
            <span ref={moveRef} className="contents">
              <MoveStageButton target={moveTarget} className="max-sm:flex-1" />
            </span>
          </div>
        )}
      </div>

      {rejectDialog}

      {/* Hidden triggers driven from the ⋯ menu and the E shortcut */}
      {stageActionKey !== "evaluate" ? (
        <span ref={evaluateRef} className="hidden">
          {evaluate}
        </span>
      ) : null}
      <span ref={editRef} className="hidden">
        <EditCandidateDrawer
          candidate={candidate}
          trigger={
            <Button size="sm" variant="ghost" title="Edit candidate">
              <Pencil className="size-4" />
              <span className="sr-only">Edit</span>
            </Button>
          }
        />
      </span>

      {resumeUrl && resumeIsPdf ? (
        <Dialog open={resumeOpen} onOpenChange={setResumeOpen}>
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
      ) : null}

      <DeleteCandidateDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        candidateId={candidate.id}
        name={name}
      />
    </div>
  );
}
