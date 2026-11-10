
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WeeklyAvailability } from "@harly/db";

const DAYS: (keyof WeeklyAvailability)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export async function PersonAvailabilityCard({
  timezone,
  weeklyAvailability,
  capacityHoursPerWeek,
}: {
  timezone: string | null;
  weeklyAvailability: WeeklyAvailability | null;
  capacityHoursPerWeek: number | null;
}) {
  const hasAvailability =
    weeklyAvailability &&
    Object.values(weeklyAvailability).some((ranges) => ranges.length > 0);

  if (!timezone && !hasAvailability && capacityHoursPerWeek == null) {
    return null;
  }

  const t = await getTranslations("features.people.personAvailabilityCard");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {timezone && (
          <div className="flex items-center justify-between">
            <span className="text-soft-ink">{t("timezone")}</span>
            <span className="font-medium">{timezone}</span>
          </div>
        )}
        {capacityHoursPerWeek != null && (
          <div className="flex items-center justify-between">
            <span className="text-soft-ink">{t("capacity")}</span>
            <span className="font-medium">
              {t("hoursPerWeek", { hours: capacityHoursPerWeek })}
            </span>
          </div>
        )}
        {hasAvailability && (
          <div className="space-y-1.5 border-t border-hairline pt-3">
            {DAYS.map(
              (day) => {
                const ranges = weeklyAvailability?.[day] ?? [];
                if (ranges.length === 0) return null;
                return (
                  <div
                    key={day}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-soft-ink">
                      {t(`days.${day}`)}
                    </span>
                    <span className="font-medium tabular-nums">
                      {ranges.map((r) => `${r.start}–${r.end}`).join(", ")}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
