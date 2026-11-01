"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getCandidateContextAction } from "@/features/ai-chat/actions";
import { DEFAULT_CLIENT_ASSISTANT, type ClientAssistantBranding } from "@/lib/ai/assistant-branding-shared";
import { HarlyAIContext } from "./HarlyAIContext";
import { HarlyAIPanel } from "./HarlyAIPanel";
import { HarlyAILauncher } from "./HarlyAILauncher";

export { useHarlyAI } from "./HarlyAIContext";

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
 * Hosts the AI panel, its bottom-right launcher, and publishes the toggle
 * through context. The launcher is always visible (Deel-style chat bubble) so
 * the copilot is discoverable even before a provider is configured; the panel
 * then shows a setup state instead of the chat.
 */
export function HarlyAIProvider({
  userName,
  userId,
  workspaceId,
  aiEnabled,
  canConfigureAi = false,
  candidateId,
  assistant = DEFAULT_CLIENT_ASSISTANT,
  children,
}: {
  userName: string;
  userId: string;
  workspaceId: string;
  aiEnabled: boolean;
  /** Admins see "Open AI settings" in the not-set-up state; others are told to ask one. */
  canConfigureAi?: boolean;
  /** Optional candidate context, so the conversation is erased with the candidate (IA-02). */
  candidateId?: string;
  /** Workspace branding of the assistant: display name, avatar, "Powered by Harly" flag. */
  assistant?: ClientAssistantBranding;
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
  const close = useCallback(() => setOpen(false), []);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const ask = useCallback((text: string) => {
    setOpen(true);
    if (text.trim()) setPendingPrompt(text.trim());
  }, []);

  // ⌘J / Ctrl+J toggles the panel from anywhere (⌘K stays search).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const value = useMemo(
    () => ({ open, toggle, enabled: aiEnabled, ask, assistant }),
    [open, toggle, aiEnabled, ask, assistant],
  );

  return (
    <HarlyAIContext value={value}>
      {children}
      <HarlyAIPanel
        userName={userName}
        persistenceKey={persistenceKey}
        aiEnabled={aiEnabled}
        canConfigureAi={canConfigureAi}
        open={open}
        onClose={close}
        pendingPrompt={pendingPrompt}
        onPendingPromptConsumed={() => setPendingPrompt(null)}
        candidateId={activeCandidateId}
        surfaceContext={surfaceContext}
      />
      <HarlyAILauncher open={open} onToggle={toggle} />
    </HarlyAIContext>
  );
}
