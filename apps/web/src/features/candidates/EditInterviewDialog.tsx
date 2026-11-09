"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
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
  NonexistentLocalTimeError,
  parseScheduledAt,
} from "@/features/interviews/shared";

const TYPES = [
  { key: "screening", labelKey: "typeScreening" },
  { key: "technical", labelKey: "typeTechnical" },
  { key: "culture_fit", labelKey: "typeCultureFit" },
  { key: "onsite", labelKey: "typeOnsite" },
  { key: "final", labelKey: "typeFinal" },
] as const;

const MODES = [
  { key: "video", labelKey: "modeVideo" },
  { key: "phone", labelKey: "modePhone" },
  { key: "onsite", labelKey: "modeOnsite" },
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
  const t = useTranslations("candidates.editInterview");
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

  const locationLabel = mode === "onsite" ? t("address") : t("meetingLink");

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
      const calendarUnchecked = result.gcalAvailability === "unknown";
      if (result.gcalBusy.length > 0) {
        warnings.push(t("calendarConflicts", { count: result.gcalBusy.length }));
      }
      if (result.internalConflicts.length > 0) {
        warnings.push(t("interviewConflicts", { count: result.internalConflicts.length }));
      }
      setAvailabilityWarning(
        warnings.length > 0
          ? t("availabilityConflicts", { conflicts: warnings.join(", "), calendarNote: calendarUnchecked ? ` ${t("calendarUnavailable")}` : "" })
          : calendarUnchecked
            ? t("calendarCouldNotCheck")
            : null,
      );
    } catch (error) {
      if (error instanceof NonexistentLocalTimeError) {
        setAvailabilityWarning(error.message);
        return;
      }
      // Silently fail
    } finally {
      setCheckingAvailability(false);
    }
  }

  function submit() {
    if (!date || !time) {
      toast.error(t("pickDateTime"));
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
        toast.error(result.error ?? t("updateError"));
        return;
      }
      if (result.warning) toast.warning(result.warning);
      const emailNote = unshownEmailWarning(result);
      if (emailNote) toast.warning(emailNote);
      toast.success(t("updated"));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Field label={t("titleOptional")} htmlFor="edit-title">
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Left column */}
            <div className="space-y-5">
              <Field label={t("type")}>
                <SegmentedControl
                  aria-label={t("type")}
                  options={TYPES.map((item) => ({ value: item.key, label: t(item.labelKey) }))}
                  value={type}
                  onValueChange={setType}
                />
              </Field>

              <Field label={t("mode")}>
                <SegmentedControl
                  aria-label={t("mode")}
                  options={MODES.map((item) => ({ value: item.key, label: t(item.labelKey) }))}
                  value={mode}
                  onValueChange={setMode}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("date")} htmlFor="edit-date">
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
                <Field label={t("time")} htmlFor="edit-time">
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
                      ? t("officeAddress")
                      : "https://meet.google.com/…"
                  }
                />
              </Field>

              <Field label={t("notes")} htmlFor="edit-notes">
                <Textarea
                  id="edit-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("notesPlaceholder")}
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
            <p className="text-xs text-muted-foreground">{t("checkingAvailability")}</p>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? t("saving") : t("saveChanges")}
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

