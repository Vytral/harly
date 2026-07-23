import "server-only";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { getWorkspaceCalStatus } from "@/lib/cal/config";
import { getWorkspaceEsignStatus } from "@/lib/esign/config";
import { getWorkspaceGCalStatus } from "@/lib/gcal/config";
import { getWorkspaceJitsiStatus } from "@/lib/jitsi/config";
import { getWorkspaceChatStatus } from "@/lib/notify/config";
import { getWorkspaceOutlookStatus } from "@/lib/outlook/config";
import { getWorkspaceSlackStatus } from "@/lib/slack/config";
import { getWorkspaceCaptchaStatus } from "@/lib/captcha";
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
  | "automation"
  | "signing"
  | "security";

export type IntegrationSlug =
  | "cal"
  | "google-calendar"
  | "google-meet"
  | "outlook-calendar"
  | "microsoft-teams"
  | "zoom"
  | "jitsi"
  | "slack"
  | "outlook"
  | "discord"
  | "telegram"
  | "gmail"
  | "linkedin"
  | "docuseal"
  | "turnstile"
  | "recaptcha"
  | "hcaptcha"
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
  signing: "Signature",
  security: "Security",
};

export const CATEGORY_ORDER: IntegrationCategory[] = [
  "calendar",
  "communication",
  "automation",
  "signing",
  "security",
];

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    slug: "cal",
    name: "Cal.com",
    category: "calendar",
    description: "Let candidates book time with your team.",
    detail:
      "Connect Cal.com so candidates can self-schedule interviews and bookings flow straight into your pipeline.",
    tileClassName:
      "bg-gradient-to-br from-slate-700 via-slate-900 to-black text-white",
  },
  {
    slug: "google-calendar",
    name: "Google Calendar",
    category: "calendar",
    description: "Sync events and interviewer availability.",
    detail:
      "Keep interviews and interviewer availability in sync with Google Calendar across your whole team.",
    // Multicolor Google mark , light neutral so every fill reads.
    tileClassName: "bg-gradient-to-br from-white via-sky-50 to-sky-200",
  },
  {
    slug: "google-meet",
    name: "Google Meet",
    category: "calendar",
    description: "Generate video links for every video interview.",
    detail:
      "Connect Google to add a Google Meet video link to every scheduled video interview. Meet shares your Google Calendar connection — connect once and both light up.",
    // Multicolor Meet mark , light emerald-teal neutral so every fill reads
    // while staying distinct from the GCal sky tile and Zoom's stronger blue.
    tileClassName: "bg-gradient-to-br from-white via-emerald-50 to-teal-100",
  },
  {
    slug: "zoom",
    name: "Zoom",
    category: "calendar",
    description: "Add video links to scheduled interviews.",
    detail:
      "Automatically create and manage Zoom meetings for every scheduled video interview.",
    // Zoom mark is saturated blue , light bg so it pops instead of drowning.
    tileClassName: "bg-gradient-to-br from-white via-sky-100 to-blue-200",
  },
  {
    slug: "outlook-calendar",
    name: "Outlook Calendar",
    category: "calendar",
    description: "Coordinate interviews with Microsoft 365.",
    detail:
      "Coordinate interviews and availability with Microsoft 365 and Outlook Calendar.",
    // Multicolor Outlook mark , light blue-tinted surface.
    tileClassName: "bg-gradient-to-br from-white via-sky-50 to-blue-200",
  },
  {
    slug: "microsoft-teams",
    name: "Microsoft Teams",
    category: "calendar",
    description: "Generate video links for every video interview.",
    detail:
      "Connect Microsoft to add a Teams meeting link to every scheduled video interview. Teams shares your Outlook connection — connect once and both light up.",
    // Multicolor Teams mark , light indigo-blue neutral so every fill reads
    // while staying distinct from Outlook's stronger blue and Zoom's sky tile.
    tileClassName: "bg-gradient-to-br from-white via-indigo-50 to-blue-100",
  },
  {
    slug: "jitsi",
    name: "Jitsi Meet",
    category: "calendar",
    description: "Self-hosted video links for interviews.",
    detail:
      "Generate a unique Jitsi Meet room link for every video interview. Point it at your self-hosted instance or the public meet.jit.si , no account or API key required.",
    // Light-grey Jitsi mark , needs a dark surface to stand out.
    tileClassName:
      "bg-gradient-to-br from-slate-600 via-slate-800 to-slate-950",
    logoClassName: "size-7",
  },
  {
    slug: "slack",
    name: "Slack",
    category: "communication",
    description: "Share hiring updates with your team.",
    detail:
      "Route hiring events to a Slack channel so your team sees new applicants and stage changes in real time.",
    // Multicolor Slack mark , light neutral.
    tileClassName: "bg-gradient-to-br from-white via-slate-50 to-slate-200",
  },
  {
    slug: "outlook",
    name: "Microsoft Outlook",
    category: "communication",
    description: "Route candidate replies to your inbox.",
    detail:
      "Send and log candidate emails through Microsoft Outlook and keep replies attached to the candidate.",
    tileClassName: "bg-gradient-to-br from-white via-sky-50 to-blue-200",
  },
  {
    slug: "discord",
    name: "Discord",
    category: "communication",
    description: "Post hiring updates to a Discord channel.",
    detail:
      "Send new applications, stage moves, hires and more to a Discord channel via an incoming webhook. No OAuth needed.",
    // Blurple Discord mark , dark Discord-grey surface so blurple pops.
    tileClassName:
      "bg-gradient-to-br from-[#404249] via-[#2b2d31] to-[#1e1f22]",
  },
  {
    slug: "telegram",
    name: "Telegram",
    category: "communication",
    description: "Get hiring notifications in a Telegram chat.",
    detail:
      "Send hiring events to a Telegram group or channel through your own bot. Create one with @BotFather in a minute.",
    // Saturated sky Telegram mark , light bg for contrast.
    tileClassName: "bg-gradient-to-br from-white via-sky-50 to-sky-200",
  },
  {
    slug: "gmail",
    name: "Gmail",
    category: "communication",
    description: "Send and log candidate emails from Gmail.",
    detail:
      "Send and log candidate emails directly from Gmail. This integration is on the way.",
    // Multicolor Gmail mark , light neutral.
    tileClassName: "bg-gradient-to-br from-white via-rose-50 to-slate-200",
    comingSoon: true,
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    category: "communication",
    description: "Publish jobs and receive applications.",
    detail:
      "Publish jobs to LinkedIn and receive applications straight into Harly. This integration is on the way.",
    // Solid-blue LinkedIn mark , light bg so the blue reads.
    tileClassName: "bg-gradient-to-br from-white via-sky-50 to-sky-200",
    comingSoon: true,
  },
  {
    slug: "docuseal",
    name: "DocuSeal",
    category: "signing",
    description: "Send offers for e-signatures with self-hosted DocuSeal.",
    detail:
      "Connect your self-hosted DocuSeal instance so candidates sign their offer inside the candidate portal. When you send an offer, Harly creates a DocuSeal submission and the candidate signs on DocuSeal's hosted page. The signed PDF and audit log land back on the offer and the status flips automatically. Bring your own instance URL and API token — no data leaves your infrastructure.",
    // DocuSeal mark is indigo on white — light neutral surface so it reads
    // (saturated mark -> light bg per the contrast rule).
    tileClassName: "bg-gradient-to-br from-white via-indigo-50 to-blue-100",
  },
  {
    slug: "turnstile",
    name: "Cloudflare Turnstile",
    category: "security",
    description: "Block bots on your public application form.",
    detail:
      "Add Cloudflare Turnstile , a privacy-friendly CAPTCHA alternative , to your public application form. Bring your own site and secret keys; every submission is verified server-side before a candidate is created. No env vars needed.",
    // Orange Turnstile mark (currentColor) , light cream surface with the brand
    // orange forced via text color so the mono logo reads (saturated mark -> light
    // bg per the contrast rule). Amber stops keep it distinct from Zapier's orange.
    tileClassName:
      "bg-gradient-to-br from-white via-amber-50 to-orange-100 text-[#f38020]",
  },
  {
    slug: "recaptcha",
    name: "Google reCAPTCHA",
    category: "security",
    description: "Block bots with Google's reCAPTCHA v2.",
    detail:
      "Add Google reCAPTCHA v2 to your public application form. Bring your own site and secret keys from the reCAPTCHA admin console; every submission is verified server-side before a candidate is created. Enabling reCAPTCHA turns off any other active CAPTCHA.",
    // Multicolor reCAPTCHA mark (blue swirl) , light blue-tinted surface so the
    // blue reads (multicolor mark -> light neutral per the contrast rule).
    tileClassName: "bg-gradient-to-br from-white via-sky-50 to-blue-100",
  },
  {
    slug: "hcaptcha",
    name: "hCaptcha",
    category: "security",
    description: "Privacy-first bot protection for your form.",
    detail:
      "Add hCaptcha , a privacy-first CAPTCHA , to your public application form. Bring your own site and secret keys; every submission is verified server-side before a candidate is created. Enabling hCaptcha turns off any other active CAPTCHA.",
    // Solid-blue hCaptcha mark , light bg so the blue pops (saturated mark ->
    // light bg per the contrast rule). Indigo stops keep it distinct from the
    // reCAPTCHA sky tile.
    tileClassName: "bg-gradient-to-br from-white via-indigo-50 to-indigo-100",
  },
  {
    slug: "zapier",
    name: "Zapier & Make",
    category: "automation",
    description: "Send Harly events to the rest of your stack.",
    detail:
      "Trigger workflows in Zapier or Make from hiring events and connect Harly to thousands of apps.",
    // Orange Zapier mark , cream surface (Zapier's own pairing).
    tileClassName: "bg-gradient-to-br from-white via-orange-50 to-orange-200",
    externalHref: "/settings/developers",
  },
  {
    slug: "webhooks",
    name: "Webhooks",
    category: "automation",
    description: "Send structured events to your own services.",
    detail:
      "Send structured hiring events to your own services with signed webhooks.",
    // House feature (no brand) , Harly evergreen.
    tileClassName:
      "bg-gradient-to-br from-emerald-500 via-pine to-emerald-900 text-white",
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
  jitsi: Awaited<ReturnType<typeof getWorkspaceJitsiStatus>>;
  docuseal: Awaited<ReturnType<typeof getWorkspaceEsignStatus>>;
  captcha: Awaited<ReturnType<typeof getWorkspaceCaptchaStatus>>;
};

/** Fetch every connectable integration's status for a workspace in parallel. */
export async function getIntegrationStatuses(
  workspaceId: string,
): Promise<IntegrationStatuses> {
  const [cal, gcal, slack, outlook, zoom, chat, telegram, jitsi, docuseal, captcha] =
    await Promise.all([
      getWorkspaceCalStatus(workspaceId),
      getWorkspaceGCalStatus(workspaceId),
      getWorkspaceSlackStatus(workspaceId),
      getWorkspaceOutlookStatus(workspaceId),
      getZoomConfig(workspaceId),
      getWorkspaceChatStatus(workspaceId),
      getWorkspaceTelegramStatus(workspaceId),
      getWorkspaceJitsiStatus(workspaceId),
      getWorkspaceEsignStatus(workspaceId),
      getWorkspaceCaptchaStatus(workspaceId),
    ]);
  return { cal, gcal, slack, outlook, zoom, chat, telegram, jitsi, docuseal, captcha };
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
    case "google-meet":
      return statuses.gcal.enabled;
    case "zoom":
      return statuses.zoom.installationState === "installed";
    case "outlook-calendar":
    case "outlook":
    case "microsoft-teams":
      return statuses.outlook.enabled;
    case "slack":
      return statuses.slack.enabled;
    case "discord":
      return (
        statuses.chat.provider === "discord" && statuses.chat.hasWebhook
      );
    case "telegram":
      return statuses.telegram.hasToken;
    case "jitsi":
      return statuses.jitsi.enabled && Boolean(statuses.jitsi.baseUrl);
    case "docuseal":
      return statuses.docuseal.enabled && statuses.docuseal.hasToken;
    case "turnstile":
    case "recaptcha":
    case "hcaptcha":
      return (
        statuses.captcha.enabled &&
        statuses.captcha.provider === slug &&
        statuses.captcha.providers[slug].hasSecretKey &&
        Boolean(statuses.captcha.providers[slug].siteKey)
      );
    default:
      return false;
  }
}

/** Convenience: the workspace context used by both index and detail routes. */
export { getWorkspaceContext };
