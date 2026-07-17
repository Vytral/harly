import "server-only";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { getWorkspaceCalStatus } from "@/lib/cal/config";
import { getWorkspaceGCalStatus } from "@/lib/gcal/config";
import { getWorkspaceChatStatus } from "@/lib/notify/config";
import { getWorkspaceOutlookStatus } from "@/lib/outlook/config";
import { getWorkspaceSlackStatus } from "@/lib/slack/config";
import { getWorkspaceTelegramStatus } from "@/lib/telegram/config";
import { getZoomConfig } from "@/lib/zoom/config";

/**
 * Central registry for connectable integrations (OAuth / persistent
 * connections). One entry per integration keeps the marketplace index and the
 * per-slug detail route in sync: add a row here, both surfaces pick it up.
 *
 * Kept JSX-free so it can be imported from server components without pulling in
 * the client settings cards. Logos are resolved by slug at the render layer.
 */

export type IntegrationCategory =
  | "calendar"
  | "communication"
  | "automation";

export type IntegrationSlug =
  | "cal"
  | "google-calendar"
  | "outlook-calendar"
  | "zoom"
  | "slack"
  | "outlook"
  | "discord"
  | "telegram"
  | "gmail"
  | "linkedin"
  | "zapier"
  | "webhooks";

export type IntegrationDefinition = {
  slug: IntegrationSlug;
  name: string;
  category: IntegrationCategory;
  /** Short line for the marketplace row. */
  description: string;
  /** Longer copy shown in the detail hero. */
  detail: string;
  /** Tailwind gradient/background for the brand tile. */
  tileClassName: string;
  /** Optional logo sizing override. */
  logoClassName?: string;
  /** True when there is no settings card yet (placeholder detail). */
  comingSoon?: boolean;
  /** External destination (e.g. Zapier -> developers). Overrides detail route. */
  externalHref?: string;
};

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  calendar: "Calendar & scheduling",
  communication: "Communication",
  automation: "Automation",
};

export const CATEGORY_ORDER: IntegrationCategory[] = [
  "calendar",
  "communication",
  "automation",
];

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    slug: "cal",
    name: "Cal.com",
    category: "calendar",
    description: "Let candidates book time with your team.",
    detail:
      "Connect Cal.com so candidates can self-schedule interviews and bookings flow straight into your pipeline.",
    tileClassName: "bg-slate-900 text-white",
  },
  {
    slug: "google-calendar",
    name: "Google Calendar",
    category: "calendar",
    description: "Sync events and interviewer availability.",
    detail:
      "Keep interviews and interviewer availability in sync with Google Calendar across your whole team.",
    tileClassName: "bg-gradient-to-br from-sky-500 via-cyan-400 to-emerald-400",
  },
  {
    slug: "zoom",
    name: "Zoom",
    category: "calendar",
    description: "Add video links to scheduled interviews.",
    detail:
      "Automatically create and manage Zoom meetings for every scheduled video interview.",
    tileClassName:
      "bg-gradient-to-br from-sky-500 via-blue-500 to-cyan-400 text-white",
  },
  {
    slug: "outlook-calendar",
    name: "Outlook Calendar",
    category: "calendar",
    description: "Coordinate interviews with Microsoft 365.",
    detail:
      "Coordinate interviews and availability with Microsoft 365 and Outlook Calendar.",
    tileClassName:
      "bg-gradient-to-br from-blue-700 via-blue-500 to-cyan-300 text-white",
  },
  {
    slug: "slack",
    name: "Slack",
    category: "communication",
    description: "Share hiring updates with your team.",
    detail:
      "Route hiring events to a Slack channel so your team sees new applicants and stage changes in real time.",
    tileClassName:
      "bg-gradient-to-br from-violet-600 via-blue-500 to-cyan-400 text-white",
  },
  {
    slug: "outlook",
    name: "Microsoft Outlook",
    category: "communication",
    description: "Route candidate replies to your inbox.",
    detail:
      "Send and log candidate emails through Microsoft Outlook and keep replies attached to the candidate.",
    tileClassName:
      "bg-gradient-to-br from-blue-700 via-blue-500 to-cyan-300 text-white",
  },
  {
    slug: "discord",
    name: "Discord",
    category: "communication",
    description: "Post hiring updates to a Discord channel.",
    detail:
      "Send new applications, stage moves, hires and more to a Discord channel via an incoming webhook. No OAuth needed.",
    tileClassName:
      "bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-400 text-white",
  },
  {
    slug: "telegram",
    name: "Telegram",
    category: "communication",
    description: "Get hiring notifications in a Telegram chat.",
    detail:
      "Send hiring events to a Telegram group or channel through your own bot. Create one with @BotFather in a minute.",
    tileClassName:
      "bg-gradient-to-br from-sky-500 via-sky-400 to-cyan-300 text-white",
  },
  {
    slug: "gmail",
    name: "Gmail",
    category: "communication",
    description: "Send and log candidate emails from Gmail.",
    detail:
      "Send and log candidate emails directly from Gmail. This integration is on the way.",
    tileClassName:
      "bg-gradient-to-br from-orange-400 via-amber-300 to-sky-400",
    comingSoon: true,
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    category: "communication",
    description: "Publish jobs and receive applications.",
    detail:
      "Publish jobs to LinkedIn and receive applications straight into Harly. This integration is on the way.",
    tileClassName:
      "bg-gradient-to-br from-sky-500 via-blue-600 to-cyan-400 text-white",
    comingSoon: true,
  },
  {
    slug: "zapier",
    name: "Zapier & Make",
    category: "automation",
    description: "Send Harly events to the rest of your stack.",
    detail:
      "Trigger workflows in Zapier or Make from hiring events and connect Harly to thousands of apps.",
    tileClassName:
      "bg-gradient-to-br from-orange-600 via-orange-400 to-amber-300 text-white",
    externalHref: "/settings/developers",
  },
  {
    slug: "webhooks",
    name: "Webhooks",
    category: "automation",
    description: "Send structured events to your own services.",
    detail:
      "Send structured hiring events to your own services with signed webhooks.",
    tileClassName:
      "bg-gradient-to-br from-emerald-700 via-teal-500 to-cyan-400 text-white",
    externalHref: "/settings/developers",
  },
];

export function getIntegration(
  slug: string,
): IntegrationDefinition | undefined {
  return INTEGRATIONS.find((i) => i.slug === slug);
}

export type IntegrationStatuses = {
  cal: Awaited<ReturnType<typeof getWorkspaceCalStatus>>;
  gcal: Awaited<ReturnType<typeof getWorkspaceGCalStatus>>;
  slack: Awaited<ReturnType<typeof getWorkspaceSlackStatus>>;
  outlook: Awaited<ReturnType<typeof getWorkspaceOutlookStatus>>;
  zoom: Awaited<ReturnType<typeof getZoomConfig>>;
  chat: Awaited<ReturnType<typeof getWorkspaceChatStatus>>;
  telegram: Awaited<ReturnType<typeof getWorkspaceTelegramStatus>>;
};

/** Fetch every connectable integration's status for a workspace in parallel. */
export async function getIntegrationStatuses(
  workspaceId: string,
): Promise<IntegrationStatuses> {
  const [cal, gcal, slack, outlook, zoom, chat, telegram] = await Promise.all([
    getWorkspaceCalStatus(workspaceId),
    getWorkspaceGCalStatus(workspaceId),
    getWorkspaceSlackStatus(workspaceId),
    getWorkspaceOutlookStatus(workspaceId),
    getZoomConfig(workspaceId),
    getWorkspaceChatStatus(workspaceId),
    getWorkspaceTelegramStatus(workspaceId),
  ]);
  return { cal, gcal, slack, outlook, zoom, chat, telegram };
}

/** Resolve whether a given integration slug is currently connected. */
export function isConnected(
  slug: IntegrationSlug,
  statuses: IntegrationStatuses,
): boolean {
  switch (slug) {
    case "cal":
      return statuses.cal.enabled;
    case "google-calendar":
      return statuses.gcal.enabled;
    case "zoom":
      return statuses.zoom.installationState === "installed";
    case "outlook-calendar":
    case "outlook":
      return statuses.outlook.enabled;
    case "slack":
      return statuses.slack.enabled;
    case "discord":
      return (
        statuses.chat.provider === "discord" && statuses.chat.hasWebhook
      );
    case "telegram":
      return statuses.telegram.hasToken;
    default:
      return false;
  }
}

/** Convenience: the workspace context used by both index and detail routes. */
export { getWorkspaceContext };
