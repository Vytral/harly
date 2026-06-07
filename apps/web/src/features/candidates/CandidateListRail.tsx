import Link from "next/link";
import type { Route } from "next";

import { PipelineSpine } from "@/components/ui/PipelineSpine";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { gravatarUrl } from "@/lib/gravatar";
import { cn } from "@/lib/utils";

export type RailCandidate = {
  id: string;
  fullName: string;
  email: string;
  role: string | null;
  stage: string | null;
};

/** Left rail for the candidate split-view — jump between candidates in context. */
export function CandidateListRail({
  candidates,
  activeId,
}: {
  candidates: RailCandidate[];
  activeId: string;
}) {
  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="text-sm font-semibold">Candidates</h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {candidates.length}
          </span>
        </div>
        <div className="max-h-[calc(100vh-11rem)] space-y-0.5 overflow-y-auto p-1.5">
          {candidates.map((c) => {
            const active = c.id === activeId;
            return (
              <Link
                key={c.id}
                href={`/dashboard/candidates/${c.id}` as Route}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors",
                  active ? "bg-accent" : "hover:bg-muted",
                )}
              >
                <UserAvatar
                  name={c.fullName}
                  src={c.email ? gravatarUrl(c.email) : null}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      active ? "text-accent-foreground" : "text-foreground",
                    )}
                  >
                    {c.fullName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.role ?? "No application"}
                  </p>
                  {c.stage ? (
                    <PipelineSpine current={c.stage} className="mt-1.5" />
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
