"use client";

import { useState } from "react";
import { HarlyAIButton, HarlyAIPanel } from "./HarlyAIPanel";

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

  return (
    <>
      <HarlyAIPanel
        userName={userName}
        aiEnabled={aiEnabled}
        open={open}
        onClose={() => setOpen(false)}
        candidateId={candidateId}
      />
      <HarlyAIButton open={open} onClick={() => setOpen((v) => !v)} />
    </>
  );
}
