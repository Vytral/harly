"use client";

import { useState } from "react";
import { HarlyAIButton, HarlyAIPanel } from "./HarlyAIPanel";

export function HarlyAIWidget({
  userName,
  aiEnabled,
}: {
  userName: string;
  aiEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <HarlyAIPanel
        userName={userName}
        aiEnabled={aiEnabled}
        open={open}
        onClose={() => setOpen(false)}
      />
      <HarlyAIButton open={open} onClick={() => setOpen((v) => !v)} />
    </>
  );
}
