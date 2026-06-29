"use client";

import { useState } from "react";
import { HarlyAIButton, HarlyAIPanel } from "./HarlyAIPanel";

export function HarlyAIWidget({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <HarlyAIPanel
        userName={userName}
        open={open}
        onClose={() => setOpen(false)}
      />
      <HarlyAIButton open={open} onClick={() => setOpen((v) => !v)} />
    </>
  );
}
