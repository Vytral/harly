"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
  { value: 1, labelKey: "mon" },
  { value: 2, labelKey: "tue" },
  { value: 3, labelKey: "wed" },
  { value: 4, labelKey: "thu" },
  { value: 5, labelKey: "fri" },
  { value: 6, labelKey: "sat" },
  { value: 7, labelKey: "sun" },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export function AutoUpdateCard({ initial }: { initial: AutoUpdateView }) {
  const t = useTranslations("features.updates.autoUpdateCard");
  const locale = useLocale();
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
      ? t("hoursMustDiffer")
      : days.length === 0
        ? t("pickDay")
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
      toast.success(t("saved"));
      router.refresh();
    });
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={ClockCountdownDuotoneIcon}
        title={t("title")}
        description={t("description")}
        badge={<StatusPill tone={initial.enabled ? "on" : "off"}>{initial.enabled ? t("on") : t("off")}</StatusPill>}
        action={
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={pending}
            aria-label={t("enableAriaLabel")}
          />
        }
      />

      <fieldset disabled={!enabled || pending} className="space-y-5 disabled:opacity-60">
        <div className="space-y-2">
          <Label>{t("whichReleases")}</Label>
          <Select value={level} onValueChange={(value) => setLevel(value === "minor" ? "minor" : "patch")}>
            <SelectTrigger className="w-full sm:max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="patch">{t("patchOnly")}</SelectItem>
              <SelectItem value="minor">{t("patchAndMinor")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("releasesNote")}</p>
        </div>

        <div className="space-y-2">
          <Label>{t("daysLabel")}</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {DAYS.map((day) => (
              <label key={day.value} className="flex items-center gap-2 text-sm text-near-ink">
                <Checkbox
                  checked={days.includes(day.value)}
                  onCheckedChange={(checked) => toggleDay(day.value, checked === true)}
                />
                {t(`weekdays.${day.labelKey}`)}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="update-start">{t("from")}</Label>
            <HourSelect id="update-start" value={startHour} onChange={setStartHour} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="update-end">{t("until")}</Label>
            <HourSelect id="update-end" value={endHour} onChange={setEndHour} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="update-timezone">{t("timeZone")}</Label>
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
          <p className="text-xs text-muted-foreground">{t("overnightNote")}</p>
        ) : null}
        {windowError ? <p className="text-xs text-danger-rust">{windowError}</p> : null}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-soft-ink">
          {initial.enabled && initial.nextWindowAt
            ? t("nextWindow", {
                when: formatWhen(initial.nextWindowAt, initial.timezone, locale),
                timeZone: initial.timezone,
              })
            : t("nothingInstalled")}
        </p>
        <Button onClick={save} disabled={!dirty || pending || (enabled && windowError !== null)}>
          {t("save")}
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
