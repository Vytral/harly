"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ClockCountdownDuotoneIcon } from "@/components/ui/icons/phosphor";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";

import { saveAutoUpdateSettingsAction } from "./actions";
import { formatWhen } from "./UpdatesPanel";

export type AutoUpdateView = {
  enabled: boolean;
  level: "patch" | "minor";
  days: number[];
  startHour: number;
  endHour: number;
  timezone: string;
  nextWindowAt: string | null;
};

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export function AutoUpdateCard({ initial }: { initial: AutoUpdateView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [level, setLevel] = useState(initial.level);
  const [days, setDays] = useState<number[]>(initial.days);
  const [startHour, setStartHour] = useState(initial.startHour);
  const [endHour, setEndHour] = useState(initial.endHour);
  const [timezone, setTimezone] = useState(initial.timezone);

  const timezoneOptions = useMemo(() => {
    const zones =
      typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return [...new Set(["UTC", ...zones, timezone])];
  }, [timezone]);

  const dirty =
    enabled !== initial.enabled ||
    level !== initial.level ||
    startHour !== initial.startHour ||
    endHour !== initial.endHour ||
    timezone !== initial.timezone ||
    days.join() !== initial.days.join();

  const windowError =
    startHour === endHour
      ? "Start and end hour must differ."
      : days.length === 0
        ? "Pick at least one day."
        : null;

  function toggleDay(day: number, checked: boolean) {
    setDays((current) =>
      (checked ? [...current, day] : current.filter((value) => value !== day)).sort((a, b) => a - b),
    );
  }

  function save() {
    startTransition(async () => {
      const result = await saveAutoUpdateSettingsAction({
        enabled,
        level,
        days,
        startHour,
        endHour,
        timezone,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Automatic update settings saved.");
      router.refresh();
    });
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={ClockCountdownDuotoneIcon}
        title="Install updates automatically outside working hours"
        description="When a release is published, the updater installs it during the window below. Harly is unavailable for a few minutes while it restarts, and a backup is taken first."
        badge={<StatusPill tone={initial.enabled ? "on" : "off"}>{initial.enabled ? "On" : "Off"}</StatusPill>}
        action={
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={pending}
            aria-label="Install updates automatically"
          />
        }
      />

      <fieldset disabled={!enabled || pending} className="space-y-5 disabled:opacity-60">
        <div className="space-y-2">
          <Label>Which releases</Label>
          <Select value={level} onValueChange={(value) => setLevel(value === "minor" ? "minor" : "patch")}>
            <SelectTrigger className="w-full sm:max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="patch">Patch releases only (0.2.4 → 0.2.5)</SelectItem>
              <SelectItem value="minor">Patch and minor releases (0.2.4 → 0.3.0)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Major releases are never installed automatically. A version that failed once is not retried
            automatically either.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Days</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {DAYS.map((day) => (
              <label key={day.value} className="flex items-center gap-2 text-sm text-near-ink">
                <Checkbox
                  checked={days.includes(day.value)}
                  onCheckedChange={(checked) => toggleDay(day.value, checked === true)}
                />
                {day.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="update-start">From</Label>
            <HourSelect id="update-start" value={startHour} onChange={setStartHour} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="update-end">Until</Label>
            <HourSelect id="update-end" value={endHour} onChange={setEndHour} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="update-timezone">Time zone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="update-timezone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {timezoneOptions.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {startHour > endHour ? (
          <p className="text-xs text-muted-foreground">
            This window runs overnight: it starts on a selected day and ends the next morning.
          </p>
        ) : null}
        {windowError ? <p className="text-xs text-danger-rust">{windowError}</p> : null}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-soft-ink">
          {initial.enabled && initial.nextWindowAt
            ? `Next window opens ${formatWhen(initial.nextWindowAt, initial.timezone)} (${initial.timezone}).`
            : "Nothing is installed automatically while this is off."}
        </p>
        <Button onClick={save} disabled={!dirty || pending || (enabled && windowError !== null)}>
          Save
        </Button>
      </div>
    </Card>
  );
}

function HourSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (hour: number) => void;
}) {
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {HOURS.map((hour) => (
          <SelectItem key={hour} value={String(hour)}>
            {hourLabel(hour)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
