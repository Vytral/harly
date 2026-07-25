"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getCandidateContextAction } from "@/features/ai-chat/actions";
import { HarlyAIPanel } from "./HarlyAIPanel";

type HarlyAIContextValue = {
  /** Whether the AI panel is currently open. */
  open: boolean;
  /** Toggle the panel. Wired to the top bar's signal button. */
  toggle: () => void;
  /** False when the workspace has no usable AI config , the trigger hides. */
  enabled: boolean;
};

const HarlyAIContext = createContext<HarlyAIContextValue>({
  open: false,
  toggle: () => {},
  enabled: false,
});

/** Read by the top bar so AI lives in chrome you can ignore, not a FAB. */
export function useHarlyAI() {
  return useContext(HarlyAIContext);
}

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

/**
 * Hosts the AI panel and publishes its toggle through context.
 *
 * This used to render a permanent floating action button in the bottom-right
 * corner , a second brand identity shouting over the work (DESIGN.md: "AI is
 * optional guidance inside flows, not a permanent noisy FAB"). The panel is
 * unchanged; only its trigger moved into the top bar's signal button, which is
 * also where the command menu sends AI actions.
 */
export function HarlyAIProvider({
  userName,
  userId,
  workspaceId,
  aiEnabled,
  candidateId,
  children,
}: {
  userName: string;
  userId: string;
  workspaceId: string;
  aiEnabled: boolean;
  /** Optional candidate context, so the conversation is erased with the candidate (IA-02). */
  candidateId?: string;
  children: ReactNode;
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

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const value = useMemo(
    () => ({ open, toggle, enabled: aiEnabled }),
    [open, toggle, aiEnabled],
  );

  return (
    <HarlyAIContext value={value}>
      {children}
      <HarlyAIPanel
        userName={userName}
        persistenceKey={persistenceKey}
        aiEnabled={aiEnabled}
        open={open}
        onClose={() => setOpen(false)}
        candidateId={activeCandidateId}
        surfaceContext={surfaceContext}
      />
    </HarlyAIContext>
  );
}
