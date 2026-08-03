"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Link2, MapPin, Phone, Video } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { scheduleInterview } from "@/features/interviews/actions";
import { checkAvailability } from "@/lib/gcal/availability";
import { buildCalBookingLink } from "@/lib/cal/link";
import { InterviewerSelect } from "./InterviewerSelect";
import { DurationInput } from "./DurationInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getBrowserTimeZone,
  parseScheduledAt,
} from "@/features/interviews/shared";

export type ScheduleApplicationOption = {
  applicationId: string;
  jobTitle: string;
  currentStageName: string | null;
};

export type ScheduleMemberOption = {
  userId: string;
  name: string;
  image: string | null;
};

const TYPES = [
  { key: "screening", label: "Screening" },
  { key: "technical", label: "Technical" },
  { key: "culture_fit", label: "Culture fit" },
  { key: "onsite", label: "Onsite" },
  { key: "final", label: "Final round" },
] as const;

const MODES = [
  { key: "video", label: "Video", icon: Video },
  { key: "phone", label: "Phone", icon: Phone },
  { key: "onsite", label: "Onsite", icon: MapPin },
] as const;

type TypeKey = (typeof TYPES)[number]["key"];
type ModeKey = (typeof MODES)[number]["key"];

export type ScheduleCalConfig = {
  enabled: boolean;
  bookingUrl: string | null;
};

export function ScheduleDialog({
  candidateId,
  workspaceId,
  candidateName,
  candidateEmail,
  applications,
  members,
  cal,
  currentUserId,
  trigger,
}: {
  candidateId: string;
  workspaceId: string;
  candidateName: string;
  candidateEmail: string;
  applications: ScheduleApplicationOption[];
  members: ScheduleMemberOption[];
  cal: ScheduleCalConfig;
  currentUserId?: string;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [applicationId, setApplicationId] = useState(
    applications[0]?.applicationId ?? "",
  );
  const [type, setType] = useState<TypeKey>("screening");
  const [mode, setMode] = useState<ModeKey>("video");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMins, setDurationMins] = useState(45);
  const [interviewerId, setInterviewerId] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [sendEmail, setSendEmail] = useState(Boolean(candidateEmail.trim()));
  const [isPending, startTransition] = useTransition();
  const [availabilityWarning, setAvailabilityWarning] = useState<string | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  const hasApplication = applications.length > 0;
  const hasCandidateEmail = candidateEmail.trim().length > 0;
  const locationLabel = mode === "onsite" ? "Address" : "Meeting link";

  const calLinkAvailable = cal.enabled && Boolean(cal.bookingUrl);

  async function checkTimeAvailability(
    newDate: string,
    newTime: string,
    duration: number,
    interviewer?: string,
  ) {
    if (!newDate || !newTime) {
      setAvailabilityWarning(null);
      return;
    }
    setCheckingAvailability(true);
    try {
      const timeZone = getBrowserTimeZone();
      const start = parseScheduledAt(`${newDate}T${newTime}`, timeZone);
      const end = new Date(start.getTime() + duration * 60_000);
      const result = await checkAvailability({
        timeMin: start,
        timeMax: end,
        interviewerId: interviewer ?? (interviewerId || undefined),
      });
      const warnings: string[] = [];
      if (result.gcalBusy.length > 0) {
        warnings.push(
          `${result.gcalBusy.length} existing calendar event${result.gcalBusy.length > 1 ? "s" : ""}`,
        );
      }
      if (result.internalConflicts.length > 0) {
        warnings.push(
          `${result.internalConflicts.length} overlapping interview${result.internalConflicts.length > 1 ? "s" : ""} in this workspace`,
        );
      }
      setAvailabilityWarning(
        warnings.length > 0
          ? `This time conflicts with ${warnings.join(" and ")}.`
          : null,
      );
    } catch {
      // Silently fail , don't block scheduling on availability check.
    } finally {
      setCheckingAvailability(false);
    }
  }

  function copyBookingLink() {
    if (!cal.bookingUrl) return;
    if (!applicationId) {
      toast.error("Pick which role this interview is for.");
      return;
    }
    const link = buildCalBookingLink({
      bookingUrl: cal.bookingUrl,
      name: candidateName,
      email: candidateEmail,
      metadata: { applicationId, candidateId, workspaceId },
    });
    void navigator.clipboard.writeText(link);
    toast.success("Booking link copied. Send it to the candidate");
  }

  function reset() {
    setType("screening");
    setMode("video");
    setDate("");
    setTime("");
    setDurationMins(45);
    setInterviewerId("");
    setLocation("");
    setNotes("");
    setSendEmail(hasCandidateEmail);
    setAvailabilityWarning(null);
  }

  function submit() {
    if (!hasApplication) {
      toast.error("This candidate has no application to attach the interview to.");
      return;
    }
    if (!applicationId) {
      toast.error("Pick which role this interview is for.");
      return;
    }
    if (!date || !time) {
      toast.error("Pick a date and time.");
      return;
    }
    startTransition(async () => {
      const timeZone = getBrowserTimeZone();
      const result = await scheduleInterview({
        workspaceId,
        candidateId,
        applicationId,
        type,
        mode,
        scheduledAt: `${date}T${time}`,
        timeZone,
        durationMins,
        interviewerId: interviewerId || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
        sendEmail: sendEmail && hasCandidateEmail,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not schedule.");
        return;
      }
      if (result.warning && result.emailStatus !== "failed") {
        toast.warning(result.warning);
      }
      if (result.emailStatus === "sent") {
        toast.success("Interview scheduled and invitation sent");
      } else if (result.emailStatus === "skipped") {
        toast.success("Interview scheduled without sending an invitation");
      } else if (result.emailStatus === "failed") {
        toast.warning(
          result.warning ??
            "Interview scheduled, but the invitation email could not be sent.",
        );
      } else {
        toast.success("Interview scheduled");
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Schedule interview</DialogTitle>
          <DialogDescription>
            Added to the candidate timeline and the team agenda.
          </DialogDescription>
        </DialogHeader>

        {!hasApplication ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            This candidate hasn&apos;t applied to any role yet. Interviews attach
            to an application.
          </p>
        ) : (
          <div className="space-y-5">
            {calLinkAvailable ? (
              <div className="space-y-2.5 rounded-xl border border-primary/30 bg-accent/40 p-3.5">
                <div className="flex items-center gap-2">
                  <Link2 className="size-4 text-primary" strokeWidth={1.8} />
                  <p className="text-[13px] font-medium tracking-tight">
                    Let the candidate self-schedule
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Send a Cal.com link. When they book, the interview syncs here
                  automatically.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full bg-card"
                  onClick={copyBookingLink}
                >
                  <Link2 className="size-4" />
                  Copy booking link
                </Button>
                <p className="text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                  or log it manually
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* Left column */}
              <div className="space-y-5">
                {applications.length > 1 ? (
                  <Field label="Role">
                    <Select value={applicationId} onValueChange={setApplicationId}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {applications.map((application) => (
                          <SelectItem
                            key={application.applicationId}
                            value={application.applicationId}
                          >
                            {application.jobTitle}
                            {application.currentStageName
                              ? ` · ${application.currentStageName}`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    For{" "}
                    <span className="font-medium text-foreground">
                      {applications[0]?.jobTitle}
                    </span>
                  </p>
                )}

                <Field label="Type">
                  <div className="grid grid-cols-3 gap-2">
                    {TYPES.map((t) => (
                      <SegButton
                        key={t.key}
                        active={type === t.key}
                        onClick={() => setType(t.key)}
                      >
                        {t.label}
                      </SegButton>
                    ))}
                  </div>
                </Field>

                <Field label="Mode">
                  <div className="grid grid-cols-3 gap-2">
                    {MODES.map((m) => (
                      <SegButton
                        key={m.key}
                        active={mode === m.key}
                        onClick={() => setMode(m.key)}
                      >
                        <m.icon className="size-4" strokeWidth={1.8} />
                        {m.label}
                      </SegButton>
                    ))}
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date" htmlFor="schedule-date">
                    <Input
                      id="schedule-date"
                      type="date"
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        checkTimeAvailability(e.target.value, time, durationMins);
                      }}
                    />
                  </Field>
                  <Field label="Time" htmlFor="schedule-time">
                    <Input
                      id="schedule-time"
                      type="time"
                      value={time}
                      onChange={(e) => {
                        setTime(e.target.value);
                        checkTimeAvailability(date, e.target.value, durationMins);
                      }}
                    />
                  </Field>
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-5">
                <DurationInput
                  value={durationMins}
                  onChange={(v) => {
                    setDurationMins(v);
                    checkTimeAvailability(date, time, v);
                  }}
                />

                <InterviewerSelect
                  value={interviewerId}
                  onChange={(v) => {
                    setInterviewerId(v);
                    if (date && time) {
                      checkTimeAvailability(date, time, durationMins, v);
                    }
                  }}
                  members={members}
                  currentUserId={currentUserId}
                />

                <Field label={locationLabel} htmlFor="schedule-location">
                  <Input
                    id="schedule-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={
                      mode === "onsite"
                        ? "Office address…"
                        : "https://meet.google.com/…"
                    }
                  />
                </Field>

                <Field label="Notes" htmlFor="schedule-notes">
                  <Textarea
                    id="schedule-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Focus areas, panel, prep…"
                    className="min-h-20"
                  />
                </Field>
              </div>
            </div>

            {availabilityWarning ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{availabilityWarning}</span>
              </div>
            ) : null}
            {checkingAvailability ? (
              <p className="text-xs text-muted-foreground">Checking availability…</p>
            ) : null}

            <label className="flex items-start gap-3 rounded-lg border bg-muted/20 px-3.5 py-3">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(event) => setSendEmail(event.target.checked)}
                disabled={!hasCandidateEmail}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">
                  Send invitation email
                </span>
                <span className="block text-xs text-muted-foreground">
                  {hasCandidateEmail
                    ? "The candidate will receive the interview details after scheduling."
                    : "Add an email address to this candidate before sending an invitation."}
                </span>
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={isPending || !hasApplication}>
            {isPending
              ? sendEmail && hasCandidateEmail
                ? "Scheduling & sending…"
                : "Scheduling…"
              : sendEmail && hasCandidateEmail
                ? "Schedule & send invite"
                : "Schedule without email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={htmlFor}
        className="text-[13px] font-medium tracking-tight text-foreground/90"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[13px] font-medium transition-colors",
        active
          ? "border-primary/40 bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
