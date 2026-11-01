"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { toast } from "@/lib/notification-island/toast";
import { advanceMessage } from "@/features/candidates/queue-position";

/**
 * What the candidate page knows about the list it was opened from, for the
 * actions that should move on after a decision. Only the review queue
 * auto-advances; everywhere else actions keep refreshing in place.
 */
export type CandidateQueueNavigation = {
  /** True in review-queue mode: decisions advance to the next item. */
  autoAdvance: boolean;
  candidateName: string;
  /** The application the queue entry stands for. */
  applicationId: string | null;
  nextHref: string | null;
  nextName: string | null;
  /** Where to go after the last item. */
  doneHref: string | null;
};

const QueueNavigationContext = createContext<CandidateQueueNavigation | null>(null);

export function CandidateQueueNavigationProvider({
  value,
  children,
}: {
  value: CandidateQueueNavigation;
  children: ReactNode;
}) {
  return (
    <QueueNavigationContext.Provider value={value}>{children}</QueueNavigationContext.Provider>
  );
}

export function useCandidateQueueNavigation() {
  return useContext(QueueNavigationContext);
}

/**
 * After a successful decision on `applicationId`: in queue mode, replace the
 * page with the next queue item (or the "queue cleared" view) and say so;
 * otherwise refresh in place. Returns true when it navigated away, so the
 * caller can skip its own success toast.
 */
export function useAdvanceAfterDecision() {
  const router = useRouter();
  const navigation = useCandidateQueueNavigation();

  return useCallback(
    (applicationId: string, action: (candidateFirstName: string) => string): boolean => {
      const target = navigation?.nextHref ?? navigation?.doneHref ?? null;
      if (
        !navigation?.autoAdvance ||
        !target ||
        (navigation.applicationId && navigation.applicationId !== applicationId)
      ) {
        (router as { refresh?: () => void }).refresh?.();
        return false;
      }
      const first = navigation.candidateName.trim().split(/\s+/)[0] ?? navigation.candidateName;
      toast.success(advanceMessage(action(first), navigation.nextHref ? navigation.nextName : null));
      router.replace(target as Route);
      return true;
    },
    [navigation, router],
  );
}
