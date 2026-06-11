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
  XCircle,
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
    status: "rejected",
    label: "Reject candidate",
    icon: XCircle,
    confirm: "Reject {name}? They'll be moved out of active pipelines.",
    destructive: true,
  },
  {
    status: "withdrawn",
    label: "Withdraw application",
    icon: UserMinus,
    confirm: "Mark {name}'s application as withdrawn? They'll stay in your candidate list but be filtered out of active pipelines.",
    destructive: true,
  },
  {
    status: "active",
    label: "Reactivate",
    icon: RotateCcw,
    confirm: "Reactivate {name}? Their applications return to the active pipeline.",
  },
];

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
        router.refresh();
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
}: {
  candidateId: string;
  name: string;
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
              router.refresh();
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
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 className="size-4" />
          Delete
        </Button>
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
  emailTemplates = [],
  emailTemplateValues = {},
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
  emailTemplates?: EmailTemplateOption[];
  emailTemplateValues?: TemplateValues;
}) {
  const applicationIds = applications.map((application) => application.applicationId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <EvaluationDrawer
        candidateId={candidate.id}
        workspaceId={candidate.workspaceId}
        stageName={stageName}
        trigger={
          <Button size="sm">
            <ClipboardCheck className="size-4" />
            Evaluate
          </Button>
        }
      />
      <EmailDrawer
        candidateId={candidate.id}
        workspaceId={candidate.workspaceId}
        email={candidate.email}
        name={name}
        templates={emailTemplates}
        templateValues={emailTemplateValues}
        trigger={
          <Button size="sm" variant="outline">
            <Mail className="size-4" />
            Email
          </Button>
        }
      />
      <ScheduleDrawer
        candidateId={candidate.id}
        workspaceId={candidate.workspaceId}
        candidateName={name}
        candidateEmail={candidate.email}
        applications={applications}
        members={members}
        cal={cal}
        trigger={
          <Button size="sm" variant="outline">
            <CalendarClock className="size-4" />
            Schedule
          </Button>
        }
      />
      <CandidateStatusMenu name={name} applicationIds={applicationIds} />
      <EditCandidateDrawer
        candidate={candidate}
        trigger={
          <Button size="sm" variant="outline">
            <Pencil className="size-4" />
            Edit
          </Button>
        }
      />
      {resumeUrl ? (
        isPdfResume(resumeUrl, resumeFileType, resumeFileName) ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <FileText className="size-4" />
                Resume
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
              <div className="h-[75vh] overflow-hidden rounded-lg border">
                <iframe src={resumeUrl} title={resumeFileName ?? "Resume"} className="size-full" />
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <Button asChild size="sm" variant="outline">
            <a href={resumeUrl} target="_blank" rel="noreferrer">
              <FileText className="size-4" />
              Resume
            </a>
          </Button>
        )
      ) : null}
      <DeleteCandidateButton candidateId={candidate.id} name={name} />
    </div>
  );
}
