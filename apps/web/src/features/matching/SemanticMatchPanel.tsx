"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";

import {
  generateJobMatchesAction,
  indexCandidatesForMatchingAction,
} from "@/features/matching/actions";
import { SEMANTIC_MATCH_LIMIT } from "@/features/matching/constants";
import type { JobMatch } from "@/features/matching/data";
import { assignFromPoolToJobAction } from "@/features/pool/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TargetIcon,
  UserPlusIcon,
} from "@/components/ui/icons/phosphor";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function matchTone(pct: number) {
  if (pct >= 75) return "text-pine";
  if (pct >= 55) return "text-clay";
  return "text-muted-foreground";
}

export function SemanticMatchPanel({
  jobId,
  aiConfigured,
  candidatePoolCount,
}: {
  jobId: string;
  aiConfigured: boolean;
  candidatePoolCount: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [matches, setMatches] = useState<JobMatch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  async function findMatches() {
    setLoading(true);
    try {
      // Index any stale/never-embedded candidates first, resumable in batches of 20.
      for (let guard = 0; guard < 50; guard++) {
        const indexResult = await indexCandidatesForMatchingAction();
        if (!indexResult.success) {
          if (indexResult.reason === "not_configured") {
            toast.error("Connect an AI provider in Settings → AI first.");
          } else if (indexResult.reason === "unsupported_provider") {
            toast.error(indexResult.error);
          } else {
            toast.error(indexResult.error);
          }
          return;
        }
        if (indexResult.result.remaining === 0) break;
      }

      const result = await generateJobMatchesAction({ jobId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setMatches(result.matches.slice(0, SEMANTIC_MATCH_LIMIT));
      if (result.matches.length === 0) {
        toast.info("No candidates in your pool yet.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function assign(candidateId: string) {
    setAssigning(candidateId);
    try {
      const result = await assignFromPoolToJobAction({ candidateId, jobId });
      if (!result.success) {
        toast.error(result.error ?? "Could not assign candidate.");
        return;
      }
      toast.success("Candidate assigned to this job's pipeline.");
    } finally {
      setAssigning(null);
    }
  }

  return (
    <Card className="gap-0 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold tracking-tight">
            <TargetIcon className="size-4 text-pine" />
            Semantic match
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            See the {SEMANTIC_MATCH_LIMIT} strongest matches from your candidate pool by embedding similarity.
          </p>
        </div>
        {aiConfigured ? (
          <Button size="sm" onClick={findMatches} disabled={loading || candidatePoolCount === 0}>
            <TargetIcon className={cn("size-4", loading && "animate-pulse")} />
            {loading
              ? "Matching…"
              : candidatePoolCount === 0
                ? "No candidates in pool"
                : matches
                  ? "Refresh matches"
                  : "Find matches"}
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/ai">Set up AI</Link>
          </Button>
        )}
      </div>

      {candidatePoolCount === 0 ? (
        <CardContent className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed py-8 text-center">
          <TargetIcon className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Your candidate pool is empty</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add candidates to the pool to generate a ranked shortlist for this role.
          </p>
        </CardContent>
      ) : matches && matches.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {matches.map((m, i) => (
            <motion.li
              key={m.candidateId}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT, delay: Math.min(i, 10) * 0.03 }}
              className="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-accent/60"
            >
              <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <Link
                href={`/dashboard/candidates/${m.candidateId}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <UserAvatar name={m.fullName} src={m.avatarUrl} size="lg" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{m.fullName}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {m.headline ?? (m.skills.length > 0 ? m.skills.slice(0, 4).join(", ") : "No headline")}
                  </span>
                </span>
              </Link>
              <span
                className={cn("flex items-center gap-1 text-sm font-semibold tabular-nums", matchTone(m.similarityPct))}
                title="Embedding similarity to this job"
              >
                <TargetIcon className="size-3.5" />
                {m.similarityPct}%
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={assigning === m.candidateId}
                onClick={() => assign(m.candidateId)}
              >
                <UserPlusIcon className="size-3.5" />
                {assigning === m.candidateId ? "Assigning…" : "Assign"}
              </Button>
            </motion.li>
          ))}
        </ul>
      ) : matches && matches.length === 0 ? (
        <CardContent className="mt-3">
          <EmptyState
            icon={TargetIcon}
            title="Nobody in the pool is indexed yet"
            hint="Indexing runs after a candidate is saved to the pool. Add a few and check back."
          />
        </CardContent>
      ) : null}
    </Card>
  );
}
