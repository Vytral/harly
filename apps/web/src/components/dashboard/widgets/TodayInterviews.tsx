import Link from "next/link";
import { CalendarClock, CalendarPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { TodayInterview } from "@/features/dashboard/widgets";
import { Tile, TileHeader, TileLink, EmptyHint } from "./primitives";

const timeFmt = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  minute: "2-digit",
});

export function TodayInterviews({
  interviews,
  className,
}: {
  interviews: TodayInterview[];
  className?: string;
}) {
  return (
    <Tile className={className}>
      <TileHeader
        icon={CalendarClock}
        title="Today's interviews"
        action={<TileLink href="/dashboard/pipeline">View pipeline</TileLink>}
      />
      <div className="flex flex-1 flex-col px-2 pb-3 pt-1">
        {interviews.length > 0 ? (
          <ul className="flex-1 space-y-0.5">
            {interviews.map((iv) => (
              <li
                key={iv.id}
                className="flex items-start gap-3 rounded-xl px-3 py-2.5"
              >
                <span className="w-16 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {timeFmt.format(new Date(iv.scheduledAt))}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{iv.candidate}</p>
                  <p className="truncate text-xs text-muted-foreground">{iv.job}</p>
                  {iv.interviewer ? (
                    <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UserAvatar
                        name={iv.interviewer}
                        size="sm"
                        className="size-5 text-[10px]"
                      />
                      {iv.interviewer}
                    </span>
                  ) : null}
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {iv.label}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyHint icon={CalendarClock} text="No interviews today. Enjoy the calm." />
        )}
        <Button asChild variant="outline" size="sm" className="mt-2 w-full">
          <Link href="/dashboard/pipeline">
            <CalendarPlus className="size-4" strokeWidth={1.8} />
            Schedule interview
          </Link>
        </Button>
      </div>
    </Tile>
  );
}
