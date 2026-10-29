"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { updateInterview } from "@/features/interviews/actions";
import { unshownEmailWarning } from "@/lib/email/delivery-warning";

import { checkAvailability } from "@/lib/gcal/availability";
import { InterviewerSelect, type InterviewerOption } from "./InterviewerSelect";
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
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import type { CandidateInterviewItem } from "@/features/interviews/shared";
import {
  getBrowserTimeZone,
  parseScheduledAt,
} from "@/features/interviews/shared";

const TYPES = [
  { key: "screening", label: "Screening" },
  { key: "technical", label: "Technical" },
  { key: "culture_fit", label: "Culture fit" },
  { key: "onsite", label: "Onsite" },
  { key: "final", label: "Final round" },
] as const;

const MODES = [
  { key: "video", label: "Video" },
  { key: "phone", label: "Phone" },
  { key: "onsite", label: "Onsite" },
] as const;

type TypeKey = (typeof TYPES)[number]["key"];
type ModeKey = (typeof MODES)[number]["key"];

export function EditInterviewDialog({
  interview,
  members,
  currentUserId,
  trigger,
}: {
  interview: CandidateInterviewItem;
  candidateId: string;
  members: InterviewerOption[];
  currentUserId?: string;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const prev = new Date(interview.scheduledAt);
  const prevDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
  const prevTime = `${String(prev.getHours()).padStart(2, "0")}:${String(prev.getMinutes()).padStart(2, "0")}`;

  const [type, setType] = useState<TypeKey>(interview.type);
  const [mode, setMode] = useState<ModeKey>(interview.mode);
  const [date, setDate] = useState(prevDate);
  const [time, setTime] = useState(prevTime);
  const [durationMins, setDurationMins] = useState(interview.durationMins);
  const [interviewerId, setInterviewerId] = useState(interview.interviewerId ?? "");
  const [location, setLocation] = useState(interview.location ?? "");
  const [notes, setNotes] = useState(interview.notes ?? "");
  const [title, setTitle] = useState(interview.title ?? "");
  const [isPending, startTransition] = useTransition();
  const [availabilityWarning, setAvailabilityWarning] = useState<string | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  const locationLabel = mode === "onsite" ? "Address" : "Meeting link";

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
        excludeInterviewId: interview.id,
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
      // Silently fail
    } finally {
      setCheckingAvailability(false);
    }
  }

  function submit() {
    if (!date || !time) {
      toast.error("Pick a date and time.");
      return;
    }
    startTransition(async () => {
      const timeZone = getBrowserTimeZone();
      const result = await updateInterview({
        interviewId: interview.id,
        type,
        mode,
        scheduledAt: `${date}T${time}`,
        timeZone,
        durationMins,
        interviewerId: interviewerId || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
        title: title.trim() || null,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      if (result.warning) toast.warning(result.warning);
      const emailNote = unshownEmailWarning(result);
      if (emailNote) toast.warning(emailNote);
      toast.success("Interview updated");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit interview</DialogTitle>
          <DialogDescription>
            Update details, change the interviewer, or reschedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Field label="Title (optional)" htmlFor="edit-title">
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Panel with engineering team"
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Left column */}
            <div className="space-y-5">
              <Field label="Type">
                <SegmentedControl
                  aria-label="Interview type"
                  options={TYPES.map((t) => ({ value: t.key, label: t.label }))}
                  value={type}
                  onValueChange={setType}
                />
              </Field>

              <Field label="Mode">
                <SegmentedControl
                  aria-label="Interview mode"
                  options={MODES.map((m) => ({ value: m.key, label: m.label }))}
                  value={mode}
                  onValueChange={setMode}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" htmlFor="edit-date">
                  <Input
                    id="edit-date"
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      checkTimeAvailability(e.target.value, time, durationMins);
                    }}
                  />
                </Field>
                <Field label="Time" htmlFor="edit-time">
                  <Input
                    id="edit-time"
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

              <Field label={locationLabel} htmlFor="edit-location">
                <Input
                  id="edit-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={
                    mode === "onsite"
                      ? "Office address…"
                      : "https://meet.google.com/…"
                  }
                />
              </Field>

              <Field label="Notes" htmlFor="edit-notes">
                <Textarea
                  id="edit-notes"
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
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
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

