"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getCandidateContextAction } from "@/features/ai-chat/actions";
import { HarlyAIButton, HarlyAIPanel } from "./HarlyAIPanel";

function candidateIdFromPath(pathname: string | null): string | undefined {
  const match = pathname?.match(
    /^\/dashboard\/candidates\/([0-9a-f-]{36})(?:\/|$)/i,
  );
  return match?.[1];
}

function surfaceLabelFromPath(pathname: string | null): string {
  if (!pathname || pathname === "/dashboard") return "Dashboard";
  if (pathname.includes("/tasks")) return "Tasks";
  if (pathname.includes("/calendars")) return "Interview calendar";
  if (pathname.includes("/reports")) return "Reports";
  if (pathname.includes("/inbox")) return "Inbox";
  if (pathname.includes("/jobs")) return "Jobs";
  if (pathname.includes("/candidates")) return "Candidates";
  return "Current workspace";
}

export function HarlyAIWidget({
  userName,
  userId,
  workspaceId,
  aiEnabled,
  candidateId,
}: {
  userName: string;
  userId: string;
  workspaceId: string;
  aiEnabled: boolean;
  /** Optional candidate context, so the conversation is erased with the candidate (IA-02). */
  candidateId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [candidateContext, setCandidateContext] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const pathname = usePathname();
  const persistenceKey = `${workspaceId}:${userId}`;
  const activeCandidateId = candidateId ?? candidateIdFromPath(pathname);
  const surfaceContext = {
    kind: activeCandidateId ? ("candidate" as const) : ("section" as const),
    label: activeCandidateId
      ? candidateContext?.id === activeCandidateId
        ? candidateContext.name
        : "Current candidate"
      : surfaceLabelFromPath(pathname),
    path: pathname ?? "/dashboard",
  };

  useEffect(() => {
    try {
      setOpen(window.sessionStorage.getItem(`harly-ai:open:${persistenceKey}`) === "1");
    } finally {
      setStorageReady(true);
    }
  }, [persistenceKey]);

  useEffect(() => {
    if (!storageReady) return;
    window.sessionStorage.setItem(`harly-ai:open:${persistenceKey}`, open ? "1" : "0");
  }, [open, persistenceKey, storageReady]);

  useEffect(() => {
    let cancelled = false;
    if (!activeCandidateId) {
      return () => {
        cancelled = true;
      };
    }
    void getCandidateContextAction(activeCandidateId).then((context) => {
      if (!cancelled) setCandidateContext(context);
    });
    return () => {
      cancelled = true;
    };
  }, [activeCandidateId]);

  return (
    <>
      <HarlyAIPanel
        userName={userName}
        persistenceKey={persistenceKey}
        aiEnabled={aiEnabled}
        open={open}
        onClose={() => setOpen(false)}
        candidateId={activeCandidateId}
        surfaceContext={surfaceContext}
      />
      <HarlyAIButton open={open} onClick={() => setOpen((v) => !v)} />
    </>
  );
}
