import { Briefcase, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/date";

export function JobIdentity({
  title,
  department,
  location,
  deletedAt,
  muted = false,
}: {
  title: string;
  department: string | null;
  location: string | null;
  deletedAt?: Date | null;
  muted?: boolean;
}) {
  return (
    <span className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Briefcase className="size-4" />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate font-medium",
            muted
              ? "text-muted-foreground"
              : "text-foreground group-hover:text-primary",
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          {deletedAt ? (
            <>Deleted {formatRelative(deletedAt)}</>
          ) : location ? (
            <>
              <MapPin className="size-3 shrink-0" />
              {[department, location].filter(Boolean).join(" · ")}
            </>
          ) : (
            (department ?? "No location set")
          )}
        </span>
      </span>
    </span>
  );
}
