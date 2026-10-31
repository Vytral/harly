"use client";

import { createContext, useContext } from "react";

import {
  DEFAULT_CLIENT_ASSISTANT,
  type ClientAssistantBranding,
} from "@/lib/ai/assistant-branding-shared";

export type HarlyAIContextValue = {
  /** Whether the AI panel is currently open. */
  open: boolean;
  /** Toggle the panel. Wired to the bottom-right launcher and ⌘K. */
  toggle: () => void;
  /** False when the workspace has no usable AI config; the panel then explains how to turn it on. */
  enabled: boolean;
  /** Open the panel and send `text` as a new turn (command menu hand-off). */
  ask: (text: string) => void;
  /** Workspace branding of the assistant (name, avatar, "Powered by" flag). */
  assistant: ClientAssistantBranding;
};

export const HarlyAIContext = createContext<HarlyAIContextValue>({
  open: false,
  toggle: () => {},
  enabled: false,
  ask: () => {},
  assistant: DEFAULT_CLIENT_ASSISTANT,
});

/** Read by anything that opens the panel (launcher, command menu). */
export function useHarlyAI() {
  return useContext(HarlyAIContext);
}

/** Avatar for the assistant: the workspace's upload, or the animated Harly mark. */
export function AssistantAvatar({
  avatarUrl,
  size,
  className,
}: {
  avatarUrl: string | null;
  size: number;
  className?: string;
}) {
  return (
    // Plain <img>: workspace uploads live on arbitrary storage hosts and the
    // default mark is an animated SVG that next/image can't optimise anyway.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl ?? "/harly-ai-animado.svg"}
      alt=""
      width={size}
      height={size}
      className={className}
      style={avatarUrl ? { objectFit: "cover" } : undefined}
    />
  );
}
