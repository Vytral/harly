"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Users } from "lucide-react";
import { toast } from "sonner";

import { detectCandidateDuplicatesAction, type DuplicateMatch } from "@/features/candidates/ai-actions";
import { AiButton } from "@/components/ui/AiButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type SuspectCandidate = {
  candidateId: string;
  fullName: string;
  email: string;
};

export function DuplicateDetectionCard({
  candidateId,
  suspects,
  aiConfigured,
}: {
  candidateId: string;
  suspects: SuspectCandidate[];
  aiConfigured: boolean;
}) {
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null);
  const [checked, setChecked] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (suspects.length === 0 && !checked) return null;

  function runAiCheck() {
    startTransition(async () => {
      const result = await detectCandidateDuplicatesAction({ candidateId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setMatches(result.matches);
      setChecked(true);
    });
  }

  // After AI check with no matches
  if (checked && matches !== null && matches.length === 0) {
    return null;
  }

  // Show AI-confirmed matches
  if (checked && matches !== null && matches.length > 0) {
    return (
      <Card className="border-clay/30 bg-clay/5">
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-clay">
            <Users className="size-4 shrink-0" />
            <p className="text-sm font-medium">Possible duplicate candidates</p>
          </div>
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.candidateId} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/candidates/${m.candidateId}`}
                    className="font-medium hover:underline truncate block"
                  >
                    {m.fullName}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate">{m.reason}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    m.confidence === "high"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-clay/15 text-clay"
                  }`}
                >
                  {m.confidence === "high" ? "Likely duplicate" : "Possible match"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  // Initial state: suspects found, not yet AI-checked
  return (
    <Card className="border-clay/20 bg-clay/5">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-clay">
          <AlertTriangle className="size-4 shrink-0" />
          <p className="text-sm">
            {suspects.length === 1
              ? "1 candidate with a similar name exists in your workspace."
              : `${suspects.length} candidates with similar names exist in your workspace.`}
          </p>
        </div>
        {aiConfigured ? (
          <AiButton
            size="sm"
            variant="outline"
            onClick={runAiCheck}
            loading={isPending}
            loadingText="Checking"
          >
            Verify with AI
          </AiButton>
        ) : (
          <div className="flex flex-wrap gap-2">
            {suspects.map((s) => (
              <Button key={s.candidateId} asChild size="sm" variant="outline">
                <Link href={`/dashboard/candidates/${s.candidateId}`}>View {s.fullName}</Link>
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
