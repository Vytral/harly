import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils";

/** Wraps a name/avatar with a link to the person's internal profile. Falls back to plain text if no username yet. */
export function PersonLink({
  username,
  className,
  children,
}: {
  username: string | null | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  if (!username) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Link
      href={`/people/${username}` as Route}
      className={cn(
        "rounded-sm outline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary",
        className,
      )}
    >
      {children}
    </Link>
  );
}
