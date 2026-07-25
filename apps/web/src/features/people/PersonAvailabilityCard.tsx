import { Clock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WeeklyAvailability } from "@harly/db";

const DAY_LABELS: Record<keyof WeeklyAvailability, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export function PersonAvailabilityCard({
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Clock className="size-3.5" />
          Availability
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {timezone && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Timezone</span>
            <span className="font-medium">{timezone}</span>
          </div>
        )}
        {capacityHoursPerWeek != null && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Capacity</span>
            <span className="font-medium">{capacityHoursPerWeek} hrs/week</span>
          </div>
        )}
        {hasAvailability && (
          <div className="space-y-1.5 border-t pt-3">
            {(Object.keys(DAY_LABELS) as (keyof WeeklyAvailability)[]).map(
              (day) => {
                const ranges = weeklyAvailability?.[day] ?? [];
                if (ranges.length === 0) return null;
                return (
                  <div
                    key={day}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-muted-foreground">
                      {DAY_LABELS[day]}
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
