"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { rescheduleInterview } from "@/features/interviews/actions";
import { checkAvailability } from "@/lib/gcal/availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import {
  getBrowserTimeZone,
  parseScheduledAt,
} from "@/features/interviews/shared";

const DURATIONS = [30, 45, 60, 90] as const;

export function RescheduleDrawer({
  interviewId,
  currentScheduledAt,
  currentDurationMins,
  currentLocation,
  trigger,
}: {
  interviewId: string;
  candidateId: string;
  currentScheduledAt: string;
  currentDurationMins: number;
  currentLocation: string | null;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const prev = new Date(currentScheduledAt);
  const prevDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
  const prevTime = `${String(prev.getHours()).padStart(2, "0")}:${String(prev.getMinutes()).padStart(2, "0")}`;

  const [date, setDate] = useState(prevDate);
  const [time, setTime] = useState(prevTime);
  const [durationMins, setDurationMins] = useState(String(currentDurationMins));
  const [location, setLocation] = useState(currentLocation ?? "");
  const [isPending, startTransition] = useTransition();
  const [availabilityWarning, setAvailabilityWarning] = useState<string | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  async function checkTimeAvailability(newDate: string, newTime: string, duration: string) {
    if (!newDate || !newTime) {
      setAvailabilityWarning(null);
      return;
    }
    setCheckingAvailability(true);
    try {
      const timeZone = getBrowserTimeZone();
      const start = parseScheduledAt(`${newDate}T${newTime}`, timeZone);
      const end = new Date(start.getTime() + Number(duration) * 60_000);
      const result = await checkAvailability({ timeMin: start, timeMax: end, excludeInterviewId: interviewId });
      if (result.gcalBusy.length > 0) {
        setAvailabilityWarning(
          `This time overlaps with ${result.gcalBusy.length} existing event${result.gcalBusy.length > 1 ? "s" : ""} on your calendar.`,
        );
      } else {
        setAvailabilityWarning(null);
      }
    } catch {
      // Silently fail , don't block rescheduling on availability check.
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
      const result = await rescheduleInterview({
        interviewId,
        scheduledAt: `${date}T${time}`,
        timeZone,
        durationMins: Number(durationMins),
        location: location.trim() || null,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not reschedule.");
        return;
      }
      if (result.warning) toast.warning(result.warning);
      toast.success("Interview rescheduled");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
        title="Reschedule interview"
        description="Update the date, time, or duration. Google Calendar will be updated automatically."
        footer={
          <>
            <Button variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label
                htmlFor="reschedule-date"
                className="text-[13px] font-medium tracking-tight text-foreground/90"
              >
                Date
              </label>
              <Input
                id="reschedule-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  checkTimeAvailability(e.target.value, time, durationMins);
                }}
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="reschedule-time"
                className="text-[13px] font-medium tracking-tight text-foreground/90"
              >
                Time
              </label>
              <Input
                id="reschedule-time"
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  checkTimeAvailability(date, e.target.value, durationMins);
                }}
              />
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

          <div className="space-y-2">
            <label className="text-[13px] font-medium tracking-tight text-foreground/90">
              Duration
            </label>
            <Select
              value={durationMins}
              onValueChange={(value) => {
                setDurationMins(value);
                checkTimeAvailability(date, time, value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} min
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="reschedule-location"
              className="text-[13px] font-medium tracking-tight text-foreground/90"
            >
              Location
            </label>
            <Input
              id="reschedule-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Meeting link or address…"
            />
          </div>
        </div>
    </SidePanel>
  );
}
