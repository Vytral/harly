"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { HarlyAIButton, HarlyAIPanel } from "./HarlyAIPanel";

function candidateIdFromPath(pathname: string | null): string | undefined {
  const match = pathname?.match(
    /^\/dashboard\/candidates\/([0-9a-f-]{36})(?:\/|$)/i,
  );
  return match?.[1];
}

export function HarlyAIWidget({
  userName,
  aiEnabled,
  candidateId,
}: {
  userName: string;
  aiEnabled: boolean;
  /** Optional candidate context, so the conversation is erased with the candidate (IA-02). */
  candidateId?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const activeCandidateId = candidateId ?? candidateIdFromPath(pathname);

  return (
    <>
      <HarlyAIPanel
        key={activeCandidateId ?? "workspace"}
        userName={userName}
        aiEnabled={aiEnabled}
        open={open}
        onClose={() => setOpen(false)}
        candidateId={activeCandidateId}
      />
      <HarlyAIButton open={open} onClick={() => setOpen((v) => !v)} />
    </>
  );
}
