"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Link2, MapPin, Phone, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";
import { copyText } from "@/lib/utils";

import { scheduleInterview } from "@/features/interviews/actions";
import { unshownEmailWarning } from "@/lib/email/delivery-warning";

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
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import {
  getBrowserTimeZone,
  NonexistentLocalTimeError,
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
  { key: "screening", labelKey: "screening" },
  { key: "technical", labelKey: "technical" },
  { key: "culture_fit", labelKey: "cultureFit" },
  { key: "onsite", labelKey: "onsite" },
  { key: "final", labelKey: "final" },
] as const;

const MODES = [
  { key: "video", labelKey: "video", icon: Video },
  { key: "phone", labelKey: "phone", icon: Phone },
  { key: "onsite", labelKey: "onsite", icon: MapPin },
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
  const t = useTranslations("features.candidates.scheduleDialog");
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
  const locationLabel = mode === "onsite" ? t("addressLabel") : t("meetingLinkLabel");

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
      const calendarUnchecked = result.gcalAvailability === "unknown";
      const calendarCount = result.gcalBusy.length;
      const interviewCount = result.internalConflicts.length;
      const unchecked = String(calendarUnchecked);
      let warning: string | null = null;
      if (calendarCount > 0 && interviewCount > 0) {
        warning = t("conflictBoth", { calendarCount, interviewCount, unchecked });
      } else if (calendarCount > 0) {
        warning = t("conflictCalendar", { calendarCount, unchecked });
      } else if (interviewCount > 0) {
        warning = t("conflictInterviews", { interviewCount, unchecked });
      } else if (calendarUnchecked) {
        warning = t("calendarUnchecked");
      }
      setAvailabilityWarning(warning);
    } catch (error) {
      if (error instanceof NonexistentLocalTimeError) {
        setAvailabilityWarning(error.message);
        return;
      }
      // Silently fail , don't block scheduling on availability check.
    } finally {
      setCheckingAvailability(false);
    }
  }

  function copyBookingLink() {
    if (!cal.bookingUrl) return;
    if (!applicationId) {
      toast.error(t("pickRole"));
      return;
    }
    const link = buildCalBookingLink({
      bookingUrl: cal.bookingUrl,
      name: candidateName,
      email: candidateEmail,
      metadata: { applicationId, candidateId, workspaceId },
    });
    void copyText(link);
    toast.success(t("copiedBookingLink"));
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
      toast.error(t("noApplication"));
      return;
    }
    if (!applicationId) {
      toast.error(t("pickRole"));
      return;
    }
    if (!date || !time) {
      toast.error(t("pickDateTime"));
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
        toast.error(result.error ?? t("scheduleError"));
        return;
      }
      if (result.warning && result.emailStatus !== "failed") {
        toast.warning(result.warning);
      }
      if (result.emailStatus === "sent") {
        toast.success(t("scheduledAndSent"));
      } else if (result.emailStatus === "skipped") {
        toast.success(t("scheduledWithoutInvite"));
      } else if (result.emailStatus === "failed") {
        toast.warning(result.warning ?? t("inviteFailed"));
      } else {
        toast.success(t("scheduled"));
      }
      const emailNote = unshownEmailWarning(result);
      if (emailNote) toast.warning(emailNote);
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
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {!hasApplication ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("noApplicationsDescription")}
          </p>
        ) : (
          <div className="space-y-5">
            {calLinkAvailable ? (
              <div className="space-y-2.5 rounded-xl border border-primary/30 bg-accent/40 p-3.5">
                <div className="flex items-center gap-2">
                  <Link2 className="size-4 text-primary" strokeWidth={1.8} />
                  <p className="text-[13px] font-medium tracking-tight">
                    {t("selfSchedule")}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("selfScheduleDescription")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full bg-card"
                  onClick={copyBookingLink}
                >
                  <Link2 className="size-4" />
                  {t("copyBookingLink")}
                </Button>
                <p className="text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("orLogManually")}
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* Left column */}
              <div className="space-y-5">
                {applications.length > 1 ? (
                  <Field label={t("role")}>
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
                    {t.rich("forRole", {
                      jobTitle: applications[0]?.jobTitle ?? "",
                      strong: (chunks) => (
                        <span className="font-medium text-foreground">{chunks}</span>
                      ),
                    })}
                  </p>
                )}

                <Field label={t("type")}>
                  <SegmentedControl
                    aria-label={t("typeAriaLabel")}
                    options={TYPES.map((option) => ({
                      value: option.key,
                      label: t(`types.${option.labelKey}`),
                    }))}
                    value={type}
                    onValueChange={setType}
                  />
                </Field>

                <Field label={t("mode")}>
                  <SegmentedControl
                    aria-label={t("modeAriaLabel")}
                    options={MODES.map((m) => ({
                      value: m.key,
                      label: t(`modes.${m.labelKey}`),
                      icon: m.icon,
                    }))}
                    value={mode}
                    onValueChange={setMode}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("date")} htmlFor="schedule-date">
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
                  <Field label={t("time")} htmlFor="schedule-time">
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
                        ? t("officeAddressPlaceholder")
                        : "https://meet.google.com/…"
                    }
                  />
                </Field>

                <Field label={t("notes")} htmlFor="schedule-notes">
                  <Textarea
                    id="schedule-notes"
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
                  {t("sendInvite")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {hasCandidateEmail
                    ? t("inviteHint")
                    : t("inviteNoEmail")}
                </span>
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={isPending || !hasApplication}>
            {isPending
              ? sendEmail && hasCandidateEmail
                ? t("schedulingAndSending")
                : t("scheduling")
              : sendEmail && hasCandidateEmail
                ? t("scheduleAndSend")
                : t("scheduleWithoutEmail")}
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

