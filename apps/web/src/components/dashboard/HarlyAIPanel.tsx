"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useLocale, useTranslations } from "next-intl";
import {
  X,
  ArrowUp,
  ChevronDown,
  Settings,
  Square,
  History,
  LayoutGrid,
  UserRound,
  Plus,
  Trash2,
  MessageSquare,
} from "lucide-react";

import { cn, randomId } from "@/lib/utils";
import { scoreBand } from "@/lib/evaluation/score-band";
import { useMotionSafe } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { HarlyAILogoMark } from "@/components/ui/icons/HarlyAILogoMark";
import { AssistantAvatar, useHarlyAI } from "@/components/dashboard/HarlyAIContext";
import { DEFAULT_ASSISTANT_NAME } from "@/lib/ai/assistant-branding-shared";
import { Markdown } from "@/components/ui/markdown";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { UiBlocks } from "@/components/dashboard/harly-ai/UiBlocks";
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from "@/components/ui/chat-container";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from "@/components/ui/prompt-input";
import {
  confirmAgentWriteAction,
  prepareAgentWriteAction,
  undoAgentWriteAction,
  type AgentWritePreview,
} from "@/lib/ai/agent/write-actions";
import { isAgentWriteTool } from "@/lib/ai/agent/write-tool-names";
import {
  listConversationsAction,
  loadConversationAction,
  deleteConversationAction,
  searchCandidateMentionsAction,
} from "@/features/ai-chat/actions";
import type {
  ConversationListItem,
  StoredUIMessage,
} from "@/features/ai-chat/data";

// ─── Phosphor icons ────────────────────────────────────────────────────────────

const PhCheck = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 256 256"
    aria-hidden="true"
    className={className}
  >
    <path
      fill="currentColor"
      d="M173.66 98.34a8 8 0 0 1 0 11.32l-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 0M232 128A104 104 0 1 1 128 24a104.11 104.11 0 0 1 104 104m-16 0a88 88 0 1 0-88 88a88.1 88.1 0 0 0 88-88"
    />
  </svg>
);
const PhWarning = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 256 256"
    aria-hidden="true"
    className={className}
  >
    <path
      fill="currentColor"
      d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88m-8-80V80a8 8 0 0 1 16 0v56a8 8 0 0 1-16 0m20 36a12 12 0 1 1-12-12a12 12 0 0 1 12 12"
    />
  </svg>
);

type Starter = {
  label: string;
  /** Sent as-is when clicked; `prefill` drops it in the composer to finish. */
  prompt: string;
  prefill?: boolean;
};

/**
 * Starter slots for the recruiter's surface, in the same order as the
 * `starterLabels` / `starterPrompts` messages. Only `prefill` lives here: the
 * copy is resolved with `t` in the empty state, so no English is duplicated.
 * Starters follow where the recruiter is. Each one is a real request the
 * agent can answer with its tools, sent on click (one step, not two).
 */
export function startersFor(surface?: { kind: "candidate" | "section"; label: string }): Array<Pick<Starter, "prefill">> {
  if (surface?.kind === "candidate") return [{}, {}, {}, {}];
  switch (surface?.label) {
    case "Jobs":
      return [{}, { prefill: true }, {}];
    case "Candidates":
      return [{}, { prefill: true }, {}];
    case "Tasks":
      return [{}, { prefill: true }];
    case "Interview calendar":
      return [{}, {}];
    case "Reports":
      return [{}, {}];
    default:
      return [{}, {}, {}, {}];
  }
}

// Human labels for the "calling a tool" inline state.
export const TOOL_LABELS: Record<string, string> = {
  "tool-loadToolGroups": "Getting the right tools",
  // Automations tools
  "tool-listAutomationTools": "Looking at automation steps",
  "tool-searchAutomations": "Searching automations",
  "tool-getAutomationContext": "Reading automation draft",
  "tool-prepareAutomationPatch": "Preparing automation proposal",
  "tool-simulateAutomationProposal": "Simulating automation",
  "tool-applyAutomationProposal": "Applying automation changes",
  "tool-resolveAutomationResources": "Matching jobs and stages",
  "tool-prepareAutomationPlan": "Planning the automation",
  "tool-compilePlan": "Building the automation",
  "tool-runBranchCoverage": "Testing every path",
  "tool-diagnoseWorkflowRun": "Diagnosing workflow run",
  "tool-getWorkflowRunDiagnosis": "Diagnosing workflow run",
  "tool-prepareAutomationRepair": "Preparing automation repair",
  // Capabilities & workspace
  "tool-workspaceCapabilities": "Checking what's set up",
  "tool-connectedIntegrations": "Checking connected integrations",
  "tool-userPermissions": "Checking your access",
  "tool-harlyProductKnowledge": "Checking how Harly works",
  "tool-resolveCandidate": "Finding candidate",
  "tool-resolveJob": "Finding job",
  "tool-resolveApplication": "Finding the application",
  "tool-reviewCandidate": "Evaluating candidate profile",
  "tool-candidateNextAction": "Determining next action",
  "tool-prepareInterview": "Preparing interview scheduling",
  "tool-hiringBrief": "Preparing hiring brief",
  "tool-getCandidateContext": "Reading the candidate",
  "tool-getApplicationContext": "Reading the application",
  "tool-getJobStatus": "Checking job status",
  "tool-jobContext": "Reading the job",
  "tool-jobDistributionOptions": "Checking job distribution options",
  // Core operational tools
  "tool-reviewPipeline": "Checking pipeline",
  "tool-candidatesNeedingReview": "Finding candidates needing review",
  "tool-jobsAtRisk": "Checking jobs at risk",
  "tool-hiringReport": "Generating hiring report",
  "tool-searchCandidates": "Searching candidates",
  "tool-listCandidates": "Listing candidates",
  "tool-candidateProfile": "Reading candidate profile",
  "tool-listJobs": "Listing jobs",
  "tool-jobDetail": "Checking job details",
  "tool-upcomingInterviews": "Checking upcoming interviews",
  "tool-todayInterviews": "Checking today's interviews",
  "tool-listTasks": "Checking tasks",
  "tool-taskCounts": "Counting tasks",
  "tool-inbox": "Checking inbox",
  "tool-getCandidateScore": "Reading AI evaluation",
  "tool-candidateScorecards": "Checking team scorecards",
  "tool-listCandidateOffers": "Checking offers",
  "tool-talentPool": "Exploring talent pool",
  "tool-listEmailTemplates": "Listing email templates",
  "tool-emailTemplate": "Reading email template",
  "tool-reportsOverview": "Generating analytics report",
  "tool-generateCandidateScore": "Generating AI evaluation",
  "tool-draftCandidateEmail": "Drafting candidate email",
  "tool-generateJobDraft": "Drafting job description",
  "tool-generateScreeningQuestions": "Generating screening questions",
  "tool-interviewBrief": "Preparing interview brief",
  "tool-summarizeInterviewNotes": "Summarizing interview notes",
  "tool-detectDuplicates": "Checking duplicates",
  "tool-compareCandidates": "Comparing candidates",
  "tool-bulkScoreJob": "Scoring job applicants",
  "tool-recentAgentActions": "Checking recent actions",
};

export function getToolLabel(partType: string): string {
  if (TOOL_LABELS[partType]) return TOOL_LABELS[partType];
  const name = partType.startsWith("tool-") ? partType.slice(5) : partType;
  const spaced = name.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return spaced ? `Looking at ${spaced}` : "Working";
}

function getLocalizedToolLabel(
  partType: string,
  translate: (key: keyof typeof TOOL_LABELS) => string,
  fallback: (name: string) => string,
  working: string,
): string {
  if (partType in TOOL_LABELS) return translate(partType as keyof typeof TOOL_LABELS);
  const name = partType.startsWith("tool-") ? partType.slice(5) : partType;
  const spaced = name.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return spaced ? fallback(spaced) : working;
}

/**
 * An assistant turn that ran tools but produced neither prose nor a write
 * confirmation card is stranded — the stream was cut (route timeout, provider
 * error, or step budget) after the last tool finished. Without this check the
 * panel shows finished tool statuses in silence, which reads as "Harly never
 * answered".
 */
export function isStrandedAssistantTurn(input: {
  isBusy: boolean;
  text: string;
  writeCardCount: number;
  toolExecutionCount: number;
}): boolean {
  return (
    !input.isBusy &&
    !input.text.trim() &&
    input.writeCardCount === 0 &&
    input.toolExecutionCount > 0
  );
}

/**
 * Normalize `useChat`'s `error` (Error | string | unknown) to display text.
 * `unavailable` is the localized fallback for errors that carry no message;
 * callers pass `t("unavailable")`. The English default only serves callers
 * outside the panel.
 */
export function chatErrorMessage(
  error: unknown,
  unavailable = "Harly AI is temporarily unavailable. Please try again in a moment.",
): string | null {
  if (error == null) return null;
  if (typeof error === "string") return unwrapJsonError(error.trim()) || null;
  if (error instanceof Error) return unwrapJsonError(error.message.trim()) || null;
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return unwrapJsonError(message.trim());
  }
  return unavailable;
}

/** The chat transport surfaces non-2xx bodies verbatim; show `{ error }` text, not raw JSON. */
function unwrapJsonError(text: string): string {
  if (!text.startsWith("{")) return text;
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    return typeof parsed.error === "string" && parsed.error.trim() ? parsed.error.trim() : text;
  } catch {
    return text;
  }
}

// Custom markdown renderers: internal links (candidate/job profiles) use the
// router and stay styled as inline chips; external links open in a new tab.
const MARKDOWN_COMPONENTS = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const isInternal = href?.startsWith("/");
    if (isInternal) {
      return (
        <Link
          href={href as Route}
          className="font-medium text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:decoration-primary"
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
      >
        {children}
      </a>
    );
  },
};

// ─── Typing / tool indicator ─────────────────────────────────────────────────

function ThinkingShimmer({ label }: { label?: string }) {
  const t = useTranslations("shell.harlyAI");
  return <TextShimmer className="text-[13px] font-medium">{`${label ?? t("thinking")}…`}</TextShimmer>;
}

function ToolStatus({
  label,
  state,
}: {
  label: string;
  state: "running" | "done" | "error" | "interrupted";
}) {
  const t = useTranslations("shell.harlyAI");
  if (state === "interrupted") {
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-soft-ink">
        <PhWarning className="shrink-0 text-warning-clay" />
        <span>{t("stoppedBeforeFinishing", { label })}</span>
      </div>
    );
  }
  if (state === "running") {
    return <ThinkingShimmer label={label} />;
  }
  return (
    <div className="flex items-center gap-1.5 text-[12px] text-soft-ink">
      {state === "error" ? (
        <PhWarning className="shrink-0 text-danger-rust" />
      ) : (
        <PhCheck className="shrink-0 text-success-olive" />
      )}
      <span>{label}</span>
    </div>
  );
}

// ─── Rich tool-result cards ───────────────────────────────────────────────────
// Render select read-tool outputs as native cards instead of leaning on the
// model to re-describe them. Unknown shapes render nothing (the model's text
// summary covers them).

const STAGE_BAR_COLORS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-quiet-mist",
];

const REC_TONE: Record<string, string> = {
  strong_yes: "text-success-olive",
  yes: "text-success-olive",
  maybe: "text-warning-clay",
  no: "text-danger-rust",
};

// ── Card primitives ──────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function CardAvatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar from external URL
      <img
        src={src}
        alt={name}
        className={cn("size-7 shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted/60 text-[10px] font-semibold text-muted-foreground",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}

// A list row that staggers in. `i` drives the entrance delay.
function Row({
  i,
  children,
  onClick,
}: {
  i: number;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  // Under reduced motion the stagger is removed: a delayed row would stay
  // hidden (fill-mode both) for up to 320ms, and that is motion the user opted out of.
  const { reduce } = useMotionSafe();
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 duration-300 animate-in fade-in slide-in-from-bottom-1 fill-mode-both",
        onClick && "cursor-pointer transition-colors hover:bg-accent/60",
      )}
      style={reduce ? undefined : { animationDelay: `${Math.min(i, 8) * 40}ms` }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  open: "text-emerald-600 dark:text-emerald-400",
  active: "text-emerald-600 dark:text-emerald-400",
  draft: "text-muted-foreground",
  closed: "text-muted-foreground",
  hired: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-rose-600 dark:text-rose-400",
  sent: "text-blue-600 dark:text-blue-400",
  accepted: "text-emerald-600 dark:text-emerald-400",
  declined: "text-rose-600 dark:text-rose-400",
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-rose-500",
  danger: "bg-amber-500",
  warning: "bg-yellow-500",
};

// Agent actions with a human label under `actionLabels` in the messages.
const ACTION_LABEL_IDS = new Set([
  "moveCandidateStage",
  "rejectCandidate",
  "createTask",
  "updateTask",
  "completeMyOpenTasks",
  "createJob",
  "addCandidateNote",
  "addCandidateTag",
  "createOffer",
  "sendOffer",
  "decideOffer",
  "scheduleInterview",
  "addToTalentPool",
  "assignFromPoolToJob",
  "createScorecard",
  "sendCandidateEmail",
  "undoAgentAction",
]);

function ToolResultCard({
  toolName,
  output,
}: {
  toolName: string;
  output: unknown;
}) {
  const t = useTranslations("shell.harlyAI");
  const locale = useLocale();
  const recommendationLabel = (value: string) => {
    const labels: Record<string, string> = {
      strong_yes: t("recommendStrongYes"),
      yes: t("recommendYes"),
      maybe: t("recommendMaybe"),
      no: t("recommendNo"),
      advance: t("recommendAdvance"),
      hold: t("recommendHold"),
    };
    return labels[value] ?? value.replace(/_/g, " ");
  };
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;

  if (toolName === "recentAgentActions" && Array.isArray(o.actions)) {
    const labelFor = (name: unknown) => {
      if (typeof name !== "string") return t("harlyAction");
      return ACTION_LABEL_IDS.has(name)
        ? t(`actionLabels.${name}`)
        : name.replace(/([a-z])([A-Z])/g, "$1 $2");
    };
    const actions = o.actions as Array<Record<string, unknown>>;
    return (
      <Card className="gap-0 border-border/70 p-2 shadow-none">
        {actions.length === 0 ? (
          <span className="px-1 py-0.5 text-[12px] text-muted-foreground">
            {t("noRecentActions")}
          </span>
        ) : (
          actions.map((action, index) => {
            const success = action.success;
            const tone =
              success === true
                ? "text-emerald-600 dark:text-emerald-400"
                : success === false
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground";
            const stateLabel =
              action.status === "processing"
                ? t("inProgress")
                : success === true
                  ? t("done")
                  : success === false
                    ? t("failed")
                    : t("unknown");
            return (
              <div
                key={
                  typeof action.receiptId === "string"
                    ? action.receiptId
                    : index
                }
                className="flex items-center gap-2 border-b border-border/50 px-1 py-2 last:border-0"
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full bg-current",
                    tone,
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium">
                    {labelFor(action.toolName)}
                  </p>
                  {typeof action.message === "string" && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {action.message}
                    </p>
                  )}
                </div>
                {action.undoable === true && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {t("undoAvailable")}
                  </span>
                )}
                <span className={cn("shrink-0 text-[10px]", tone)}>
                  {stateLabel}
                </span>
              </div>
            );
          })
        )}
      </Card>
    );
  }

  // Pipeline → stage bars
  if (toolName === "reviewPipeline" && Array.isArray(o.stages)) {
    const stages = o.stages as { stage: string; count: number }[];
    const max = Math.max(1, ...stages.map((s) => s.count));
    const job = (o.job as { title?: string } | null)?.title;
    return (
      <Card className="gap-2 border-border/70 p-3 shadow-none">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-semibold tracking-tight">
            {job ?? t("pipeline")}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {t("activeCount", { count: String(o.totalActive ?? 0) })}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {stages.map((s, i) => (
            <div key={s.stage} className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate text-[11px] text-muted-foreground">
                {s.stage}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    STAGE_BAR_COLORS[i % STAGE_BAR_COLORS.length],
                  )}
                  style={{ width: `${(s.count / max) * 100}%` }}
                />
              </div>
              <span className="w-5 shrink-0 text-right text-[11px] font-medium tabular-nums">
                {s.count}
              </span>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // Candidate AI score → score chip + recommendation. Covers both the read
  // tool and the generate tool (both return the same scored shape).
  if (
    (toolName === "getCandidateScore" ||
      toolName === "generateCandidateScore") &&
    o.scored === true
  ) {
    const rec = String(o.recommendation ?? "");
    const score = Number(o.score ?? 0);
    const strengths = Array.isArray(o.strengths)
      ? (o.strengths as string[])
      : [];
    const gaps = Array.isArray(o.gaps) ? (o.gaps as string[]) : [];
    const band = scoreBand(score);
    const tone =
      band === "strong" || band === "good"
        ? "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400"
        : band === "mixed"
          ? "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400"
          : "from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-400";
    return (
      <Card className="gap-2.5 overflow-hidden border-border/70 p-3 shadow-none">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-[17px] font-bold tabular-nums",
              tone,
            )}
          >
            {score}
          </div>
          <div className="flex min-w-0 flex-col">
            <span
              className={cn(
                "text-[13px] font-semibold capitalize",
                REC_TONE[rec] ?? "",
              )}
            >
              {rec ? recommendationLabel(rec) : t("scored")}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {t("aiFitScore")}
            </span>
          </div>
        </div>
        {typeof o.summary === "string" && (
          <p className="text-[12px] leading-snug text-muted-foreground">
            {o.summary as string}
          </p>
        )}
        {(strengths.length > 0 || gaps.length > 0) && (
          <div className="flex flex-col gap-1.5 border-t border-border/50 pt-2">
            {strengths.slice(0, 3).map((s, i) => (
              <div
                key={`st-${i}`}
                className="flex items-start gap-1.5 text-[11px]"
              >
                <PhCheck className="mt-0.5 shrink-0 text-emerald-500" />
                <span className="text-foreground/80">{s}</span>
              </div>
            ))}
            {gaps.slice(0, 2).map((g, i) => (
              <div
                key={`gp-${i}`}
                className="flex items-start gap-1.5 text-[11px]"
              >
                <PhWarning className="mt-0.5 shrink-0 text-amber-500" />
                <span className="text-foreground/80">{g}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  // Hiring report → KPI grid
  if (
    toolName === "hiringReport" &&
    o.metrics &&
    typeof o.metrics === "object"
  ) {
    const metrics = o.metrics as Record<
      string,
      { value: number; deltaPct: number; positive: boolean; isRate: boolean }
    >;
    const labels: Record<string, string> = {
      applications: "applications",
      interviews: "interviews",
      hires: "hires",
      offerAcceptance: "offerAcceptance",
    };
    return (
      <Card className="grid grid-cols-2 gap-2 border-border/70 p-3 shadow-none">
        {Object.entries(metrics).map(([key, m]) => (
          <div key={key} className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">
              {labels[key] ? t(labels[key] as "applications" | "interviews" | "hires" | "offerAcceptance") : key}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[15px] font-semibold tabular-nums">
                {m.value}
                {m.isRate ? "%" : ""}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium tabular-nums",
                  m.positive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
                )}
              >
                {m.deltaPct > 0 ? "+" : ""}
                {m.deltaPct}%
              </span>
            </div>
          </div>
        ))}
      </Card>
    );
  }

  // Candidates needing review → avatar list with waiting badge
  if (toolName === "candidatesNeedingReview" && Array.isArray(o.candidates)) {
    const list = o.candidates as Array<{
      candidateId: string;
      name: string;
      avatarUrl: string | null;
      job: string;
      stage: string;
      waitingDays: number;
    }>;
    if (list.length === 0) return null;
    return (
      <Card className="gap-0.5 border-border/70 p-2 shadow-none">
        {list.slice(0, 8).map((c, i) => (
          <Row key={c.candidateId} i={i}>
            <CardAvatar name={c.name} src={c.avatarUrl} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] font-medium text-foreground">
                {c.name}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {c.job} · {c.stage}
              </span>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                c.waitingDays >= 6
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {c.waitingDays}d
            </span>
          </Row>
        ))}
      </Card>
    );
  }

  // Candidate list → avatar list
  if (toolName === "listCandidates" && Array.isArray(o.candidates)) {
    const list = o.candidates as Array<{
      candidateId: string;
      name: string;
      avatarUrl?: string | null;
      email: string;
      location: string | null;
    }>;
    if (list.length === 0) return null;
    return (
      <Card className="gap-0.5 border-border/70 p-2 shadow-none">
        {list.slice(0, 8).map((c, i) => (
          <Row key={c.candidateId} i={i}>
            <CardAvatar name={c.name} src={c.avatarUrl} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] font-medium text-foreground">
                {c.name}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {c.location ?? c.email}
              </span>
            </div>
          </Row>
        ))}
        {list.length > 8 && (
          <p className="px-2 pt-1 text-[10px] text-muted-foreground">
            {t("moreCount", { count: list.length - 8 })}
          </p>
        )}
      </Card>
    );
  }

  // Candidate profile → header + applications
  if (toolName === "candidateProfile" && o.found === true) {
    const apps = Array.isArray(o.applications)
      ? (o.applications as Array<{
          job: string;
          stage: string | null;
          status: string;
        }>)
      : [];
    const tags = Array.isArray(o.tags) ? (o.tags as string[]) : [];
    return (
      <Card className="gap-2.5 border-border/70 p-3 shadow-none">
        <div className="flex items-center gap-2.5">
          <CardAvatar
            name={String(o.name ?? "")}
            src={typeof o.avatarUrl === "string" ? o.avatarUrl : null}
            className="size-9"
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold tracking-tight">
              {String(o.name ?? "")}
            </span>
            {o.headline ? (
              <span className="truncate text-[11px] text-muted-foreground">
                {String(o.headline)}
              </span>
            ) : o.location ? (
              <span className="truncate text-[11px] text-muted-foreground">
                {String(o.location)}
              </span>
            ) : null}
          </div>
        </div>
        {apps.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-border/50 pt-2">
            {apps.map((a, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="truncate text-foreground/80">{a.job}</span>
                <span
                  className={cn(
                    "shrink-0 font-medium",
                    STATUS_TONE[a.status] ?? "text-muted-foreground",
                  )}
                >
                  {a.stage ?? a.status}
                </span>
              </div>
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 6).map((t) => (
              <span
                key={t}
                className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </Card>
    );
  }

  // Jobs at risk → severity dots
  if (toolName === "jobsAtRisk" && Array.isArray(o.jobs)) {
    const list = o.jobs as Array<{
      id: string;
      title: string;
      reason: string;
      severity: string;
    }>;
    if (list.length === 0) return null;
    return (
      <Card className="gap-0.5 border-border/70 p-2 shadow-none">
        {list.map((j, i) => (
          <Row key={j.id} i={i}>
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                SEVERITY_TONE[j.severity] ?? "bg-muted-foreground",
              )}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] font-medium text-foreground">
                {j.title}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {j.reason}
              </span>
            </div>
          </Row>
        ))}
      </Card>
    );
  }

  // Job list → title + counts
  if (toolName === "listJobs" && Array.isArray(o.jobs)) {
    const list = o.jobs as Array<{
      id: string;
      title: string;
      status: string;
      activeApplicants: number;
      newThisWeek: number;
    }>;
    if (list.length === 0) return null;
    return (
      <Card className="gap-0.5 border-border/70 p-2 shadow-none">
        {list.slice(0, 8).map((j, i) => (
          <Row key={j.id} i={i}>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] font-medium text-foreground">
                {j.title}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium capitalize",
                  STATUS_TONE[j.status] ?? "text-muted-foreground",
                )}
              >
                {j.status}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
              <span>{t("activeCount", { count: j.activeApplicants })}</span>
              {j.newThisWeek > 0 && (
                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
                  +{j.newThisWeek}
                </span>
              )}
            </div>
          </Row>
        ))}
      </Card>
    );
  }

  // Interviews (today / upcoming) → time + candidate
  if (
    (toolName === "todayInterviews" || toolName === "upcomingInterviews") &&
    Array.isArray(o.interviews)
  ) {
    const list = o.interviews as Array<{
      id: string;
      candidate: string | null;
      job: string | null;
      label?: string;
      type?: string | null;
      scheduledAt: string | Date | null;
    }>;
    if (list.length === 0) return null;
    const fmt = (d: string | Date | null) => {
      if (!d) return "";
      const date = new Date(d);
      return toolName === "todayInterviews"
        ? date.toLocaleTimeString(locale, {
            hour: "numeric",
            minute: "2-digit",
          })
        : date.toLocaleDateString(locale, { month: "short", day: "numeric" });
    };
    return (
      <Card className="gap-0.5 border-border/70 p-2 shadow-none">
        {list.slice(0, 8).map((iv, i) => (
          <Row key={iv.id} i={i}>
            <span className="w-14 shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
              {fmt(iv.scheduledAt)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] font-medium text-foreground">
                {iv.candidate ?? t("unknownCandidate")}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {iv.label ?? iv.type ?? ""}
                {iv.job ? ` · ${iv.job}` : ""}
              </span>
            </div>
          </Row>
        ))}
      </Card>
    );
  }

  // Task list → status dot + title
  if (toolName === "listTasks" && Array.isArray(o.tasks)) {
    const list = o.tasks as Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      dueDate: string | null;
      owner: string | null;
    }>;
    if (list.length === 0) return null;
    const PRIORITY_TONE: Record<string, string> = {
      urgent: "bg-rose-500",
      high: "bg-amber-500",
      medium: "bg-blue-500",
      low: "bg-muted-foreground/40",
    };
    return (
      <Card className="gap-0.5 border-border/70 p-2 shadow-none">
        {list.slice(0, 8).map((t, i) => (
          <Row key={t.id} i={i}>
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                PRIORITY_TONE[t.priority] ?? "bg-muted-foreground/40",
              )}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] font-medium text-foreground">
                {t.title}
              </span>
              {t.owner && (
                <span className="truncate text-[11px] text-muted-foreground">
                  {t.owner}
                </span>
              )}
            </div>
            <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
              {t.status.replace(/_/g, " ")}
            </span>
          </Row>
        ))}
      </Card>
    );
  }

  // Task counts → pill grid
  if (
    toolName === "taskCounts" &&
    o &&
    typeof o === "object" &&
    !Array.isArray(o)
  ) {
    const entries = Object.entries(o).filter(
      ([, v]) => typeof v === "number",
    ) as [string, number][];
    if (entries.length === 0) return null;
    return (
      <Card className="flex-row flex-wrap gap-2 border-border/70 p-3 shadow-none">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tabular-nums">{v}</span>
            <span className="text-[11px] capitalize text-muted-foreground">
              {k.replace(/_/g, " ")}
            </span>
          </div>
        ))}
      </Card>
    );
  }

  // Inbox → action list with urgency
  if (toolName === "inbox" && Array.isArray(o.items)) {
    const list = o.items as Array<Record<string, unknown>>;
    if (list.length === 0) return null;
    return (
      <Card className="gap-0.5 border-border/70 p-2 shadow-none">
        {list.slice(0, 8).map((it, i) => {
          const title = String(it.title ?? it.label ?? it.candidate ?? t("item"));
          const sub = String(it.subtitle ?? it.detail ?? it.job ?? "");
          const due = String(it.due ?? it.dueState ?? "");
          return (
            <Row key={i} i={i}>
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  due === "overdue"
                    ? "bg-rose-500"
                    : due === "today"
                      ? "bg-amber-500"
                      : "bg-blue-500",
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] font-medium text-foreground">
                  {title}
                </span>
                {sub && (
                  <span className="truncate text-[11px] text-muted-foreground">
                    {sub}
                  </span>
                )}
              </div>
            </Row>
          );
        })}
      </Card>
    );
  }

  // Scorecards → rating rows
  if (
    toolName === "candidateScorecards" &&
    o.found === true &&
    Array.isArray(o.scorecards)
  ) {
    const list = o.scorecards as Array<{
      rating: string;
      stage: string | null;
      author: string | null;
      comment: string | null;
    }>;
    if (list.length === 0) return null;
    const RATING_TONE: Record<string, string> = {
      strong: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      mixed: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      weak: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    };
    return (
      <Card className="gap-1.5 border-border/70 p-2.5 shadow-none">
        {list.slice(0, 5).map((s, i) => (
          <div
            key={i}
            className="flex flex-col gap-1 duration-300 animate-in fade-in slide-in-from-bottom-1 fill-mode-both"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize",
                  RATING_TONE[s.rating] ?? "bg-muted text-muted-foreground",
                )}
              >
                {s.rating}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {s.author ?? ""}
                {s.stage ? ` · ${s.stage}` : ""}
              </span>
            </div>
            {s.comment && (
              <p className="text-[11px] leading-snug text-foreground/80">
                {s.comment}
              </p>
            )}
          </div>
        ))}
      </Card>
    );
  }

  // Offers → status + salary
  if (toolName === "listCandidateOffers" && Array.isArray(o.offers)) {
    const list = o.offers as Array<{
      offerId: string;
      job: string;
      status: string;
      salaryAmount: number | null;
      currency: string | null;
      salaryPeriod: string | null;
    }>;
    if (list.length === 0) return null;
    return (
      <Card className="gap-0.5 border-border/70 p-2 shadow-none">
        {list.map((of, i) => (
          <Row key={of.offerId} i={i}>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] font-medium text-foreground">
                {of.job}
              </span>
              {of.salaryAmount != null && (
                <span className="truncate text-[11px] text-muted-foreground">
                  {of.currency ?? ""} {of.salaryAmount.toLocaleString()}
                  {of.salaryPeriod
                    ? of.salaryPeriod === "annual"
                      ? t("perYearShort")
                      : t("perMonthShort")
                    : ""}
                </span>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 text-[11px] font-medium capitalize",
                STATUS_TONE[of.status] ?? "text-muted-foreground",
              )}
            >
              {of.status}
            </span>
          </Row>
        ))}
      </Card>
    );
  }

  // Talent pool → total + by-source + avatars
  if (toolName === "talentPool" && Array.isArray(o.candidates)) {
    const list = o.candidates as Array<{
      candidateId: string;
      name: string;
      avatarUrl?: string | null;
      headline: string | null;
      source: string;
    }>;
    return (
      <Card className="gap-2 border-border/70 p-3 shadow-none">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-semibold tracking-tight">
            {t("talentPool")}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {t("totalCount", { count: String(o.total ?? list.length) })}
          </span>
        </div>
        {list.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {list.slice(0, 6).map((c, i) => (
              <Row key={c.candidateId} i={i}>
                <CardAvatar name={c.name} src={c.avatarUrl} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12px] font-medium text-foreground">
                    {c.name}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {c.headline ?? c.source}
                  </span>
                </div>
              </Row>
            ))}
          </div>
        )}
      </Card>
    );
  }

  // Reports overview → summary KPIs + funnel
  if (
    toolName === "reportsOverview" &&
    o.summary &&
    typeof o.summary === "object"
  ) {
    const s = o.summary as Record<string, number | null>;
    const funnel = Array.isArray(o.funnel)
      ? (o.funnel as Array<{ name: string; count: number; pct: number }>)
      : [];
    return (
      <Card className="gap-3 border-border/70 p-3 shadow-none">
        <div className="grid grid-cols-2 gap-2">
          {[
            [t("openRoles"), s.openRoles],
            [t("candidates"), s.totalCandidates],
            [t("applications90d"), s.applications90d],
            [t("hires"), s.hires],
          ].map(([label, val]) => (
            <div key={String(label)} className="flex flex-col">
              <span className="text-[15px] font-semibold tabular-nums">
                {val ?? 0}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {String(label)}
              </span>
            </div>
          ))}
        </div>
        {funnel.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-border/50 pt-2">
            {funnel.map((f, i) => (
              <div key={f.name} className="flex items-center gap-2">
                <span className="w-16 shrink-0 truncate text-[11px] text-muted-foreground">
                  {f.name}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full duration-500 animate-in slide-in-from-left",
                      STAGE_BAR_COLORS[i % STAGE_BAR_COLORS.length],
                    )}
                    style={{ width: `${f.pct}%` }}
                  />
                </div>
                <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {f.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  // Compare candidates → score columns
  if (toolName === "compareCandidates" && Array.isArray(o.compared)) {
    const list = o.compared as Array<{
      applicationId: string;
      score: number;
      recommendation: string;
      summary: string;
    }>;
    if (list.length === 0) return null;
    const tone = (score: number) => {
      const band = scoreBand(score);
      return band === "strong" || band === "good"
        ? "text-emerald-600 dark:text-emerald-400"
        : band === "mixed"
          ? "text-amber-600 dark:text-amber-400"
          : "text-rose-600 dark:text-rose-400";
    };
    return (
      <Card className="gap-2 border-border/70 p-3 shadow-none">
        {list.map((c, i) => (
          <div
            key={c.applicationId}
            className="flex items-start gap-2.5 duration-300 animate-in fade-in slide-in-from-bottom-1 fill-mode-both"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-[14px] font-bold tabular-nums",
                tone(c.score),
              )}
            >
              {c.score}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  "text-[12px] font-semibold capitalize",
                  REC_TONE[c.recommendation] ?? "",
                )}
              >
                {recommendationLabel(c.recommendation)}
              </span>
              <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {c.summary}
              </span>
            </div>
          </div>
        ))}
      </Card>
    );
  }

  // Email draft → subject + body preview
  if (toolName === "draftCandidateEmail" && o.drafted === true) {
    return (
      <Card className="gap-0 overflow-hidden border-border/70 p-0 shadow-none">
        <div className="border-b border-border/50 bg-muted/40 px-3 py-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("subject")}
          </span>
          <p className="text-[12px] font-medium text-foreground">
            {String(o.subject ?? "")}
          </p>
        </div>
        <p className="whitespace-pre-wrap px-3 py-2.5 text-[12px] leading-snug text-foreground/85">
          {String(o.body ?? "")}
        </p>
      </Card>
    );
  }

  // Duplicate matches → confidence rows
  if (
    toolName === "detectDuplicates" &&
    o.ok === true &&
    Array.isArray(o.matches)
  ) {
    const list = o.matches as Array<{
      fullName: string;
      email: string;
      confidence: string;
      reason: string;
    }>;
    if (list.length === 0) {
      return (
        <Card className="border-border/70 p-3 shadow-none">
          <span className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400">
            <PhCheck className="shrink-0" /> {t("noDuplicates")}
          </span>
        </Card>
      );
    }
    return (
      <Card className="gap-0.5 border-border/70 p-2 shadow-none">
        {list.map((m, i) => (
          <Row key={i} i={i}>
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                m.confidence === "high" ? "bg-rose-500" : "bg-amber-500",
              )}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12px] font-medium text-foreground">
                {m.fullName}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {m.reason}
              </span>
            </div>
            <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
              {m.confidence === "high" ? t("confidenceHigh") : m.confidence === "medium" ? t("confidenceMedium") : m.confidence}
            </span>
          </Row>
        ))}
      </Card>
    );
  }

  // Bulk score result → succeeded / remaining summary
  if (toolName === "bulkScoreJob" && o.ok === true) {
    return (
      <Card className="flex-row flex-wrap gap-3 border-border/70 p-3 shadow-none">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {String(o.succeeded ?? 0)}
          </span>
          <span className="text-[11px] text-muted-foreground">{t("scored")}</span>
        </div>
        {Number(o.failed ?? 0) > 0 && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">
              {String(o.failed)}
            </span>
            <span className="text-[11px] text-muted-foreground">{t("failed")}</span>
          </div>
        )}
        {Number(o.remaining ?? 0) > 0 && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tabular-nums">
              {String(o.remaining)}
            </span>
            <span className="text-[11px] text-muted-foreground">{t("remaining")}</span>
          </div>
        )}
      </Card>
    );
  }

  return null;
}

// ─── Generic confirm card for ANY write tool ──────────────────────────────────

type WriteActionDetail = {
  label: string;
  value: string;
};

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatDateTime(value: unknown): string | null {
  const text = optionalText(value);
  if (!text) return null;

  // Date-only values are task due dates. Parse them as local calendar dates so
  // they do not shift back one day in time zones west of UTC.
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text,
  );
  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: text.includes("T") ? "short" : undefined,
  });
}

function formatMoney(
  input: Record<string, unknown>,
  t: ReturnType<typeof useTranslations>,
): string | null {
  const amount = input.salaryAmount;
  if (typeof amount !== "number") return null;

  const currency = optionalText(input.currency) ?? "";
  const period =
    input.salaryPeriod === "annual"
      ? t("periodYear")
      : input.salaryPeriod === "monthly"
        ? t("periodMonth")
        : "";
  return `${currency ? `${currency} ` : ""}${amount.toLocaleString()}${period}`;
}

function useWriteActionPreview(
  toolName: string,
  input: Record<string, unknown>,
): { title: string; details: WriteActionDetail[] } {
  const t = useTranslations("shell.harlyAI");
  const detail = (label: string, value: string | null): WriteActionDetail[] =>
    value ? [{ label, value }] : [];
  const taskIds = Array.isArray(input.taskIds)
    ? input.taskIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];

  switch (toolName) {
    case "undoAgentAction":
      return { title: t("writeActions.undoAgentAction"), details: [] };
    case "moveCandidateStage":
      return {
        title: t("writeActions.moveCandidateStage"),
        details: [
          ...detail(t("detailCandidate"), optionalText(input.candidateName)),
          ...detail(t("detailFrom"), optionalText(input.fromStageName)),
          ...detail(t("detailTo"), optionalText(input.toStageName)),
        ],
      };
    case "rejectCandidate":
      return { title: t("writeActions.rejectCandidate"), details: [] };
    case "createTask":
      return {
        title: t("writeActions.createTask"),
        details: [
          ...detail(t("detailTask"), optionalText(input.title)),
          ...detail(t("detailPriority"), optionalText(input.priority)),
          ...detail(t("detailDue"), formatDateTime(input.dueDate)),
        ],
      };
    case "updateTask": {
      const count = taskIds.length || (optionalText(input.taskId) ? 1 : 0);
      const changes = [
        input.status
          ? t("changeStatus", { status: String(input.status).replace(/_/g, " ") })
          : null,
        optionalText(input.title)
          ? t("changeTitle", { title: optionalText(input.title) ?? "" })
          : null,
        input.priority ? t("changePriority", { priority: String(input.priority) }) : null,
        input.clearDueDate === true
          ? t("changeDueRemove")
          : formatDateTime(input.dueDate)
          ? t("changeDueDate", { date: formatDateTime(input.dueDate) ?? "" })
            : null,
        optionalText(input.ownerId) ? t("changeOwner") : null,
      ].filter((change): change is string => Boolean(change));
      return {
        title: count > 1 ? t("writeActions.updateTasks", { count }) : t("writeActions.updateTask"),
        details: [
          ...detail(
            t("detailAffected"),
            count ? t("tasksCount", { count }) : null,
          ),
          ...detail(t("detailChanges"), changes.join(", ") || null),
        ],
      };
    }
    case "createJob":
      return {
        title: t("writeActions.createJob"),
        details: [
          ...detail(t("detailRole"), optionalText(input.title)),
          ...detail(t("detailWorkplace"), optionalText(input.workplaceType)),
          ...detail(
            t("detailEmployment"),
            optionalText(input.employmentType)?.replace(/_/g, " ") ?? null,
          ),
          ...detail(t("detailLocation"), optionalText(input.location)),
        ],
      };
    case "addCandidateNote":
      return {
        title: t("writeActions.addCandidateNote"),
        details: detail(
          t("detailNote"),
          optionalText(input.body)?.slice(0, 180) ?? null,
        ),
      };
    case "addCandidateTag":
      return {
        title: t("writeActions.addCandidateTag"),
        details: detail(t("detailTag"), optionalText(input.label)),
      };
    case "createOffer":
      return {
        title: t("writeActions.createOffer"),
        details: [
          ...detail(t("detailRole"), optionalText(input.title)),
          ...detail(t("detailCompensation"), formatMoney(input, t)),
          ...detail(t("detailStartDate"), formatDateTime(input.startDate)),
          ...detail(t("detailExpires"), formatDateTime(input.expiresAt)),
        ],
      };
    case "sendOffer":
      return { title: t("writeActions.sendOffer"), details: [] };
    case "decideOffer":
      return {
        title: t("writeActions.decideOffer"),
        details: detail(t("detailDecision"), optionalText(input.decision)),
      };
    case "scheduleInterview":
      return {
        title: t("writeActions.scheduleInterview"),
        details: [
          ...detail(
            t("detailType"),
            optionalText(input.type)?.replace(/_/g, " ") ?? null,
          ),
          ...detail(t("detailWhen"), formatDateTime(input.scheduledAt)),
          ...detail(
            t("detailDuration"),
            typeof input.durationMins === "number"
              ? t("minutes", { count: input.durationMins })
              : null,
          ),
          ...detail(t("detailMode"), optionalText(input.mode)),
        ],
      };
    case "addToTalentPool":
      return {
        title: t("writeActions.addToTalentPool"),
        details: [
          ...detail(t("detailSource"), optionalText(input.source)),
          ...detail(t("detailReason"), optionalText(input.reason)),
        ],
      };
    case "assignFromPoolToJob":
      return { title: t("writeActions.assignFromPoolToJob"), details: [] };
    case "createScorecard":
      return {
        title: t("writeActions.createScorecard"),
        details: [
          ...detail(t("detailRating"), optionalText(input.rating)),
          ...detail(t("detailStage"), optionalText(input.stageName)),
          ...detail(
            t("detailComment"),
            optionalText(input.comment)?.slice(0, 180) ?? null,
          ),
        ],
      };
    case "sendCandidateEmail":
      return {
        title: t("writeActions.sendCandidateEmail"),
        details: [
          ...detail(t("detailTo"), optionalText(input.toEmail)),
          ...detail(t("detailSubject"), optionalText(input.subject)),
        ],
      };
    case "generateCandidateScore":
      return {
        title: t("writeActions.generateCandidateScore"),
        details: [
          ...detail(t("detailCandidate"), optionalText(input.candidateName)),
          ...detail(t("detailRole"), optionalText(input.jobTitle)),
          { label: t("detailDataSent"), value: t("resumeAndAnswers") },
        ],
      };
    case "bulkScoreJob":
      return {
        title: t("writeActions.bulkScoreJob"),
        details: [
          ...detail(t("detailRole"), optionalText(input.jobTitle)),
          { label: t("detailScope"), value: t("unscoredApplicants") },
          { label: t("detailDataSent"), value: t("resumesAndAnswers") },
        ],
      };
    default:
      return { title: t("confirmAction"), details: [] };
  }
}

// Writes whose receipt carries an undo (lib/ai/agent/action-receipts.ts:
// AgentActionUndo). Everything else is final once confirmed, and the card says
// so before the recruiter clicks.
const REVERSIBLE_WRITES = new Set([
  "moveCandidateStage",
  "createTask",
  "scheduleInterview",
]);

function WriteConfirmCard({
  toolCallId,
  toolName,
  summary,
  input,
  serverPreview,
  done,
  pending,
  onConfirm,
  onCancel,
  onUndo,
}: {
  toolCallId: string;
  toolName: string;
  summary: string;
  input: Record<string, unknown>;
  serverPreview?: AgentWritePreview;
  done: {
    confirmed: boolean;
    error?: string;
    message?: string;
    receiptId?: string;
    undoable?: boolean;
    undoing?: boolean;
    undone?: boolean;
  } | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onUndo?: () => void;
}) {
  const t = useTranslations("shell.harlyAI");
  const isMove = toolName === "moveCandidateStage";
  const from = String(input.fromStageName ?? "");
  const to = String(input.toStageName ?? "");
  const who = String(input.candidateName ?? "");
  const localPreview = useWriteActionPreview(toolName, input);
  const requiresCanonicalPreview = [
    "moveCandidateStage",
    "rejectCandidate",
    "sendCandidateEmail",
    "sendOffer",
    "decideOffer",
    "scheduleInterview",
    "createOffer",
    "generateCandidateScore",
    "bulkScoreJob",
    "applyAutomationProposal",
  ].includes(toolName);
  const verifying =
    requiresCanonicalPreview &&
    (!serverPreview || serverPreview.title === "Verifying action…");
  const preview = verifying
    ? { title: t("checkingDetails"), details: [] }
    : serverPreview?.canonical && serverPreview.ok
      ? serverPreview
      : localPreview;
  const blocked = Boolean(requiresCanonicalPreview && serverPreview && !serverPreview.ok && !verifying);
  const reversible = REVERSIBLE_WRITES.has(toolName);
  const titleId = `write-action-${toolCallId}`;

  if (done) {
    const ok = done.confirmed && !done.error;
    return (
      <div
        className="flex items-center gap-2.5 rounded-[var(--radius-inner)] border border-hairline bg-pure-snow px-3 py-2.5 text-[13px] duration-200 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none"
        role={done.error ? "alert" : "status"}
        aria-live={done.error ? "assertive" : "polite"}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            done.error ? "bg-danger-rust" : ok ? (done.undone ? "bg-quiet-mist" : "bg-chartreuse-signal") : "bg-quiet-mist",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className={cn("leading-snug", done.error ? "text-danger-rust" : "text-near-ink")}>
            {done.error
              ? done.error
              : done.undone
                ? t("undone")
                : ok
                  ? (done.message ?? t("donePeriod"))
                  : t("cancelledNoChanges")}
          </p>
          {isMove && ok && !done.undone && from && to ? (
            <div className="mt-1.5">
              <StagePath from={from} to={to} animate />
            </div>
          ) : null}
        </div>
        {ok && done.undoable && !done.undone && onUndo ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2.5 text-[12.5px]"
            onClick={onUndo}
            disabled={done.undoing}
          >
            {done.undoing ? t("undoing") : t("undo")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-[var(--radius-inner)] border border-hairline bg-pure-snow duration-200 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none"
      aria-labelledby={titleId}
      aria-busy={pending || verifying}
    >
      <div className="space-y-2.5 px-3 pt-3 pb-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 id={titleId} className="text-[14px] font-semibold leading-snug tracking-[-0.01em] text-near-ink">
            {preview.title}
          </h3>
          {!verifying && !blocked ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                reversible ? "bg-sage-wash text-sage-ink" : "bg-card-inset text-soft-ink",
              )}
            >
              <span
                aria-hidden="true"
                className={cn("size-1.5 rounded-full", reversible ? "bg-success-olive" : "bg-warning-clay")}
              />
              {reversible ? t("reversible") : t("cannotUndo")}
            </span>
          ) : null}
        </div>
        {blocked ? (
          <p
            className="rounded-[var(--radius-btn)] bg-danger-rust/10 px-2.5 py-2 text-[12.5px] leading-snug text-danger-rust"
            role="alert"
          >
            {serverPreview?.error ?? t("actionCouldNotBeVerified")}
          </p>
        ) : verifying ? (
          <div className="space-y-1.5" aria-hidden="true">
            <div className="h-8 animate-pulse rounded-[var(--radius-btn)] bg-card-inset motion-reduce:animate-none" />
            <div className="h-8 animate-pulse rounded-[var(--radius-btn)] bg-card-inset motion-reduce:animate-none" />
          </div>
        ) : preview.details.length > 0 ? (
          <dl className="space-y-1">
            {preview.details.map((item) => (
              <div
                key={item.label}
                className="flex items-start justify-between gap-3 rounded-[var(--radius-btn)] bg-card-inset px-2.5 py-1.5 text-[12.5px] leading-snug"
              >
                <dt className="shrink-0 text-soft-ink">{item.label}</dt>
                <dd className="min-w-0 break-words text-right font-medium text-near-ink">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {toolName === "applyAutomationProposal" &&
        serverPreview?.automationLifecycle ? (
          <AutomationLifecycleChip
            stage={serverPreview.automationLifecycle.stage}
            reason={serverPreview.automationLifecycle.reason}
          />
        ) : null}
        {summary ? (
          <p className="text-[12.5px] leading-snug text-soft-ink">{summary}</p>
        ) : null}
        {toolName === "applyAutomationProposal" &&
        serverPreview?.canonical &&
        serverPreview.ok &&
        serverPreview.automationChanges ? (
          <AutomationProposalCard preview={serverPreview} />
        ) : null}
        {isMove && who && from && to ? <StagePath from={from} to={to} /> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-hairline px-3 py-2.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-3 text-[13px]"
          onClick={onCancel}
          disabled={pending}
          aria-label={t("cancelAction", { title: preview.title })}
        >
          {t("cancel")}
        </Button>
        <Button
          size="sm"
          className="h-8 px-3 text-[13px]"
          onClick={onConfirm}
          disabled={pending || verifying || blocked}
        >
          {pending ? t("working") : verifying ? t("checking") : preview.title}
        </Button>
      </div>
    </section>
  );
}

// Recruiter-facing automation proposal card: plain words, no graph jargon.
// Edges, metadata renames, per-node coverage levels, and permission codenames
// stay out — the summary, the step list, the test outcome, and what access
// the automation needs are what the decision requires.
function humanizeAutomationLabel(value: string): string {
  const words = value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replaceAll(":", " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  return words
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word,
    )
    .join(" ");
}

function AutomationProposalCard({ preview }: { preview: AgentWritePreview }) {
  const t = useTranslations("shell.harlyAI");
  const changes = preview.automationChanges ?? [];
  const visible = changes.slice(0, 8);
  const hidden = changes.length - visible.length;
  const simulation = preview.automationSimulation;
  const simulationLabel = !simulation
    ? null
    : simulation.status === "verified"
      ? t("allPathsTested")
      : simulation.status === "partial"
        ? t("partiallyTested")
        : t("testsFailed");
  const requirements = preview.automationRequirements;
  const needLines: string[] = [];
  if (requirements) {
    if (requirements.permissions.length > 0) {
      needLines.push(t("needsPermission", { permissions: requirements.permissions.map(humanizeAutomationLabel).join(", ") }));
    }
    const uses = [...requirements.integrations, ...requirements.resources].map(
      humanizeAutomationLabel,
    );
    if (uses.length > 0) {
      needLines.push(t("usesResources", { resources: uses.join(", ") }));
    }
  }
  return (
    <div className="space-y-1.5 rounded-lg bg-muted/45 px-2.5 py-2 text-[11px] leading-snug">
      <p className="font-medium text-foreground">{t("automationSummary")}</p>
      <ul className="max-h-28 space-y-1 overflow-y-auto text-muted-foreground" aria-label={t("automationSteps")}>
        {visible.map((change) => (
          <li key={`${change.kind}:${change.id}`} className="flex gap-1.5">
            <span aria-hidden="true">·</span>
            <span>
              {t("stepLine", {
                step: change.kind === "node_added" ? t("stepAdded") : change.kind === "node_removed" ? t("stepRemoved") : t("stepUpdated"),
                title: change.title || humanizeAutomationLabel(change.id),
              })}
            </span>
          </li>
        ))}
        {hidden > 0 ? <li>{t("plusSteps", { count: hidden })}</li> : null}
        {visible.length === 0 ? <li>{t("noStepChanges")}</li> : null}
      </ul>
      {simulation && simulationLabel ? (
        <p className="border-t border-border/50 pt-1.5 text-muted-foreground">
          {simulationLabel} · {simulation.coveragePercent}%
          {simulation.uncoveredNodeCount > 0
            ? ` · ${t("stepsUntested", { count: simulation.uncoveredNodeCount })}`
            : ""}
        </p>
      ) : null}
      {needLines.length > 0 ? (
        <div className="border-t border-border/50 pt-1.5 text-muted-foreground">
          {needLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Canonical automation lifecycle chip (§12.14). One vocabulary across
// proposals, jobs, and runs: suggested → validated → simulated → queued →
// executed → delivered, with uncertain for anything needing human review.
function AutomationLifecycleChip({ stage, reason }: { stage: string; reason: string }) {
  const tones: Record<string, string> = {
    suggested: "bg-muted/60 text-muted-foreground",
    validated: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    simulated: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    queued: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    executed: "bg-muted text-foreground",
    delivered: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200",
    uncertain: "bg-destructive/10 text-destructive",
  };
  const label = stage
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return (
    <p className="flex items-center gap-1.5 text-[11px] leading-snug">
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-medium",
          tones[stage] ?? "bg-muted/60 text-muted-foreground",
        )}
      >
        {label}
      </span>
      {reason ? <span className="text-muted-foreground">{reason}</span> : null}
    </p>
  );
}

// Visual before→after stage path. Animates the arrow + destination on confirm.
function StagePath({
  from,
  to,
  animate,
}: {
  from: string;
  to: string;
  animate?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="rounded-md bg-muted px-2 py-1 font-medium text-muted-foreground">
        {from}
      </span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 256 256"
        aria-hidden="true"
        className="shrink-0 text-muted-foreground/50"
      >
        <path
          fill="currentColor"
          d="m221.66 133.66l-72 72a8 8 0 0 1-11.32-11.32L196.69 136H40a8 8 0 0 1 0-16h156.69l-58.35-58.34a8 8 0 0 1 11.32-11.32l72 72a8 8 0 0 1 0 11.32"
        />
      </svg>
      <span
        className={cn(
          "rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary ring-1 ring-primary/20",
          animate && "duration-300 animate-in fade-in zoom-in-95",
        )}
      >
        {to}
      </span>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  firstName,
  surface,
  onStarter,
}: {
  firstName: string;
  surface?: { kind: "candidate" | "section"; label: string };
  onStarter: (starter: Starter) => void;
}) {
  const t = useTranslations("shell.harlyAI");
  const { assistant } = useHarlyAI();
  const group = surface?.kind === "candidate" ? "candidate" :
    surface?.label === "Jobs" ? "jobs" :
    surface?.label === "Candidates" ? "candidates" :
    surface?.label === "Tasks" ? "tasks" :
    surface?.label === "Interview calendar" ? "interviews" :
    surface?.label === "Reports" ? "reports" : "home";
  const candidateName = surface?.kind === "candidate" && surface.label !== "Current candidate"
    ? surface.label
    : t("thisCandidate");
  const starters = startersFor(surface).map((slot, index) => ({
    prefill: slot.prefill,
    label: t(`starterLabels.${group}.${index}`, { name: candidateName }),
    prompt: t(`starterPrompts.${group}.${index}`, { name: candidateName }),
  }));
  const heading =
    surface?.kind === "candidate" && surface.label !== "Current candidate"
      ? t("candidateHeading", { name: surface.label })
      : t("greeting", { name: firstName });
  return (
    <div className="flex flex-col gap-3.5 px-1 pt-1 pb-1">
      <div className="flex flex-col items-start gap-2.5">
        <AssistantAvatar avatarUrl={assistant.avatarUrl} size={32} className={cn("size-8", assistant.avatarUrl && "rounded-full")} />
        <h2 className="font-display text-[19px] leading-tight text-near-ink">{heading}</h2>
      </div>
      <ul className="flex flex-col gap-1.5">
        {starters.map((starter, i) => (
          <li key={starter.label}>
            <button
              type="button"
              onClick={() => onStarter(starter)}
              className="group flex w-full items-center justify-between gap-3 rounded-[var(--radius-btn)] bg-card-inset px-3 py-2.5 text-left text-[13.5px] text-near-ink transition-colors duration-150 hover:bg-soft-kraft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-200 motion-reduce:animate-none"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span>{starter.label}</span>
              <ArrowUp className="size-3.5 rotate-45 text-quiet-mist transition-colors group-hover:text-near-ink" strokeWidth={2.2} />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[12px] leading-snug text-soft-ink">
        {t("capabilities")}
      </p>
    </div>
  );
}

/** Tiny attribution under the composer, only for white-labelled (renamed) assistants. */
function PoweredByFootnote() {
  const t = useTranslations("shell.harlyAI");
  const { assistant } = useHarlyAI();
  if (!assistant.showPoweredBy || assistant.name === DEFAULT_ASSISTANT_NAME) return null;
  return (
    <p className="pt-1.5 text-center text-[11px] leading-none text-quiet-mist">
      {t("poweredBy")}
    </p>
  );
}

function NotConfiguredState({ canConfigure }: { canConfigure: boolean }) {
  const t = useTranslations("shell.harlyAI");
  const { assistant } = useHarlyAI();
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <AssistantAvatar
        avatarUrl={assistant.avatarUrl}
        size={72}
        className={cn("size-[72px]", assistant.avatarUrl && "rounded-full")}
      />
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-semibold tracking-tight">
          {t("notConfiguredTitle", { name: assistant.name })}
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {canConfigure
            ? t("configurePrompt")
            : t("askAdminPrompt")}
        </p>
      </div>
      {canConfigure ? (
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/settings/ai">
            <Settings className="size-3.5" />
            {t("openAISettings")}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

// ─── Chat body (one conversation) ─────────────────────────────────────────────
// Keyed by conversationId in the parent so switching threads remounts it with
// fresh initial messages , the cleanest way to reseed useChat.

type HarlyChatProps = {
  conversationId: string;
  initialMessages: StoredUIMessage[];
  userName: string;
  /** Candidate currently visible in the dashboard. */
  candidateId?: string;
  surfaceContext?: {
    kind: "candidate" | "section";
    label: string;
    path: string;
  };
  automationContext?: AutomationContext;
  onAutomationApplied?: (result: {
    workflowId: string;
    draftRevision?: number;
  }) => void | Promise<void>;
  onConversationActivity: () => void;
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
};

/**
 * Editor snapshot shared with Harly AI when the chat panel is open inside the
 * Automations builder. Mirrors `HarlyToolContext['activeAutomation']`
 * (tools.ts) and the `automationContext` schema in the chat route so the
 * three don't drift out of sync again (D5). `graph`/`layout` carry the
 * user's actual unsaved edits — not just their hash — so the model can act on
 * what the user currently sees instead of the last-saved server revision.
 */
export type AutomationContext = {
  workflowId: string | null;
  draftRevision?: number;
  /** Hash of the server-saved draft used as the apply CAS boundary. */
  serverContentHash?: string;
  /** Hash of the exact graph currently visible in the editor. */
  localSnapshotHash?: string;
  /** Kept for compatibility with older chat clients. */
  contentHash?: string;
  selectedNodeId?: string;
  validationIssues?: Array<{
    nodeId: string;
    fieldPath: string;
    message: string;
  }>;
  activeTab?: "build" | "test" | "runs";
  sampleScenario?: string;
  isNew?: boolean;
  isUnsaved?: boolean;
  /** The local WorkflowGraphV2, included only while there are unsaved edits. */
  graph?: Record<string, unknown>;
  layout?: Record<string, unknown>;
};

function HarlyChat({
  conversationId,
  initialMessages,
  userName,
  candidateId,
  surfaceContext,
  automationContext,
  onAutomationApplied,
  onConversationActivity,
  pendingPrompt,
  onPendingPromptConsumed,
}: HarlyChatProps) {
  const t = useTranslations("shell.harlyAI");
  const { assistant } = useHarlyAI();
  const [input, setInput] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<
    Array<{ id: string; name: string; email: string; avatarUrl: string | null }>
  >([]);
  const [mentionedCandidates, setMentionedCandidates] = useState<
    Record<string, string>
  >({});
  const [writeResults, setWriteResults] = useState<
    Record<
      string,
      {
        confirmed: boolean;
        error?: string;
        message?: string;
        receiptId?: string;
        undoable?: boolean;
        undoing?: boolean;
        undone?: boolean;
      }
    >
  >({});
  const [pendingWriteIds, setPendingWriteIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [preparedWritePreviews, setPreparedWritePreviews] = useState<
    Record<string, AgentWritePreview>
  >({});
  const preparedWriteRequestsRef = useRef(new Map<string, string>());
  const pendingWriteIdsRef = useRef(new Set<string>());
  const firstName = userName.split(" ")[0] ?? userName;
  const notifiedRef = useRef(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // `useChat` keeps its transport for the lifetime of this `id` (it only
  // recreates the underlying Chat instance when `id` changes), so a plain
  // object passed as `body` would freeze candidateId/mentionedCandidateIds/
  // `useChat` keeps its transport for the lifetime of this `id` (it only
  // recreates the underlying Chat instance when `id` changes), so a `body`
  // set once at construction would freeze candidateId/mentionedCandidateIds/
  // surfaceContext/automationContext (including the local graph, D5) at
  // whatever they were on the FIRST render, silently going stale on every
  // later turn of the same conversation. Instead, the transport's own body
  // stays minimal and every `sendMessage` call below passes the CURRENT
  // values explicitly via `ChatRequestOptions.body`, which the AI SDK merges
  // over the transport's static body per request.
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai/chat" }),
    [],
  );

  const { messages, sendMessage, regenerate, addToolOutput, status, stop, error } = useChat({
    id: conversationId,
    messages: initialMessages as never,
    transport,
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const pending: Array<{
      id: string;
      tool: string;
      input: Record<string, unknown>;
      key: string;
    }> = [];
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts as Array<{
        type?: string;
        toolCallId?: string;
        state?: string;
        input?: Record<string, unknown>;
      }>) {
        const tool = part.type?.startsWith("tool-")
          ? part.type.slice("tool-".length)
          : "";
        // While the model is still streaming a call its input is partial
        // (often `{}`): preparing against it fails validation and — worse —
        // the failure was cached forever under the toolCallId. Wait for a
        // settled, non-empty input and re-prepare if the input keeps growing.
        if (
          !tool ||
          !part.toolCallId ||
          !part.input ||
          Object.keys(part.input).length === 0 ||
          part.state === "input-streaming" ||
          !isAgentWriteTool(tool)
        ) {
          continue;
        }
        pending.push({
          id: part.toolCallId,
          tool,
          input: part.input,
          key: `${part.toolCallId}:${JSON.stringify(part.input)}`,
        });
      }
    }
    for (const item of pending) {
      if (preparedWriteRequestsRef.current.get(item.id) === item.key) continue;
      preparedWriteRequestsRef.current.set(item.id, item.key);
      void prepareAgentWriteAction(item.tool, item.input).then((preview) => {
        // Drop stale responses: the input may have grown while this
        // request was in flight; only the latest key may write.
        if (preparedWriteRequestsRef.current.get(item.id) !== item.key) return;
        setPreparedWritePreviews((previous) => ({
          ...previous,
          [item.id]: preview,
        }));
      });
    }
  }, [messages, preparedWritePreviews]);

  useEffect(() => {
    if (mentionQuery === null || mentionQuery.length === 0) return;
    const timer = window.setTimeout(() => {
      void searchCandidateMentionsAction(mentionQuery).then(
        setMentionCandidates,
      );
    }, 140);
    return () => window.clearTimeout(timer);
  }, [mentionQuery]);

  // After the first turn of a brand-new conversation finishes, refresh the
  // history list so it shows up with its derived title.
  useEffect(() => {
    if (status === "ready" && messages.length > 0 && !notifiedRef.current) {
      notifiedRef.current = true;
      onConversationActivity();
    }
  }, [status, messages.length, onConversationActivity]);

  function handleInputChange(value: string) {
    setInput(value);
    const mention = value.match(/(?:^|\s)@([^\n@]*)$/);
    const nextMentionQuery = mention ? (mention[1] ?? "").trim() : null;
    setMentionQuery(nextMentionQuery);
    if (!nextMentionQuery) setMentionCandidates([]);
    setMentionedCandidates((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([, name]) =>
          value.toLocaleLowerCase().includes(`@${name.toLocaleLowerCase()}`),
        ),
      ),
    );
  }

  function selectMention(candidate: { id: string; name: string }) {
    const mentionStart = input.lastIndexOf("@");
    setInput(`${input.slice(0, mentionStart)}@${candidate.name} `);
    setMentionQuery(null);
    setMentionCandidates([]);
    setMentionedCandidates((previous) => ({
      ...previous,
      [candidate.id]: candidate.name,
    }));
  }

  // Context the recruiter was looking at when each turn was sent, keyed by the
  // user-message ordinal, so the thread can say "Now about X" when it changes.
  const [contextMarks, setContextMarks] = useState<Record<number, string>>({});

  function send(raw: string) {
    const text = raw.trim();
    if (!text || isBusy) return;
    const ordinal = messages.filter((m) => m.role === "user").length;
    if (surfaceContext?.label) {
      setContextMarks((previous) => ({ ...previous, [ordinal]: surfaceContext.label }));
    }
    sendMessage(
      { text },
      {
        body: {
          conversationId,
          candidateId,
          mentionedCandidateIds: Object.keys(mentionedCandidates),
          surfaceContext,
          automationContext,
          timeZone,
        },
      },
    );
    setInput("");
  }

  function submit() {
    send(input);
  }

  // Hand-off from ⌘K: send once, as soon as the chat can take a turn.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    if (!pendingPrompt || isBusy) return;
    sendRef.current(pendingPrompt);
    onPendingPromptConsumed?.();
  }, [pendingPrompt, isBusy, onPendingPromptConsumed]);

  function runStarter(starter: Starter) {
    if (starter.prefill) {
      setInput(starter.prompt);
      return;
    }
    send(starter.prompt);
  }

  /**
   * Retry after a failed turn. When the failure left the user's message
   * unanswered, regenerate that turn instead of sending a duplicate message.
   */
  function retryLast() {
    if (isBusy) return;
    if (messages.at(-1)?.role === "user") {
      void regenerate({
        body: {
          conversationId,
          candidateId,
          mentionedCandidateIds: Object.keys(mentionedCandidates),
          surfaceContext,
          automationContext,
          timeZone,
        },
      });
      return;
    }
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const text = (lastUser.parts as Array<{ type: string; text?: string }>)
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("");
    send(text);
  }

  function continueConversation() {
    if (isBusy) return;
    sendMessage(
      { text: t("continuePrompt") },
      {
        body: {
          conversationId,
          candidateId,
          mentionedCandidateIds: Object.keys(mentionedCandidates),
          surfaceContext,
          automationContext,
          timeZone,
        },
      },
    );
  }

  async function handleWriteConfirm(
    toolName: string,
    toolCallId: string,
    rawInput: unknown,
    confirmed: boolean,
  ) {
    if (!confirmed) {
      if (pendingWriteIdsRef.current.has(toolCallId)) return;
      setWriteResults((p) => ({ ...p, [toolCallId]: { confirmed: false } }));
      void addToolOutput({
        tool: toolName,
        toolCallId,
        output: { confirmed: false, note: "User cancelled." },
      });
      return;
    }
    if (pendingWriteIdsRef.current.has(toolCallId)) return;

    pendingWriteIdsRef.current.add(toolCallId);
    setPendingWriteIds((previous) => new Set(previous).add(toolCallId));
    try {
      const previewToken = preparedWritePreviews[toolCallId]?.previewToken;
      const confirmedInput =
        toolName === "applyAutomationProposal" &&
        previewToken &&
        typeof rawInput === "object" &&
        rawInput !== null &&
        !Array.isArray(rawInput)
          ? { ...(rawInput as Record<string, unknown>), previewToken }
          : rawInput;
      const res = await confirmAgentWriteAction(
        toolName,
        confirmedInput,
        toolCallId,
      );
      if (
        res.success &&
        toolName === "applyAutomationProposal" &&
        typeof res.workflowId === "string"
      ) {
        await onAutomationApplied?.({
          workflowId: res.workflowId,
          draftRevision:
            typeof res.draftRevision === "number"
              ? res.draftRevision
              : undefined,
        });
      }
      setWriteResults((p) => ({
        ...p,
        [toolCallId]: {
          confirmed: true,
          error: res.success ? undefined : res.error,
          message: res.message,
          receiptId: res.receiptId,
          undoable: Boolean(res.undo),
        },
      }));
      void addToolOutput({
        tool: toolName,
        toolCallId,
        output: res.success
          ? { confirmed: true, ...res }
          : { confirmed: true, error: res.error ?? t("actionFailed") },
      });
    } finally {
      pendingWriteIdsRef.current.delete(toolCallId);
      setPendingWriteIds((previous) => {
        const next = new Set(previous);
        next.delete(toolCallId);
        return next;
      });
    }
  }

  async function handleWriteUndo(toolCallId: string) {
    const current = writeResults[toolCallId];
    if (!current?.receiptId || current.undoing || current.undone) return;
    setWriteResults((previous) => ({
      ...previous,
      [toolCallId]: { ...current, undoing: true },
    }));
    const result = await undoAgentWriteAction(current.receiptId);
    setWriteResults((previous) => ({
      ...previous,
      [toolCallId]: {
        ...current,
        undoing: false,
        undone: result.success,
        undoable: result.success ? false : current.undoable,
        error: result.success ? undefined : result.error,
        message: result.success
          ? (result.message ?? t("actionUndone"))
          : current.message,
      },
    }));
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <>
        {/* Chat area */}
        <ChatContainerRoot className="h-0 min-h-0 flex-1 px-4">
          <ChatContainerContent className="gap-4 py-4">
            {!hasMessages && (
              <EmptyState
                firstName={firstName}
                surface={surfaceContext}
                onStarter={runStarter}
              />
            )}

            {messages.map((message, messageIndex) => {
              if (message.role === "user") {
                const text = message.parts
                  .filter((p) => p.type === "text")
                  .map((p) => (p as { text: string }).text)
                  .join("");
                const ordinal = messages
                  .slice(0, messageIndex)
                  .filter((m) => m.role === "user").length;
                const mark = contextMarks[ordinal];
                const previousMark = ordinal > 0 ? contextMarks[ordinal - 1] : undefined;
                const contextChanged = Boolean(mark && previousMark && mark !== previousMark);
                return (
                  <div key={message.id} className="flex flex-col gap-3">
                    {contextChanged ? (
                      <div className="flex items-center gap-2 text-[11.5px] text-soft-ink" role="separator">
                        <span className="h-px flex-1 bg-hairline" />
                        <span>{t("contextChanged", { name: mark ?? "" })}</span>
                        <span className="h-px flex-1 bg-hairline" />
                      </div>
                    ) : null}
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-[var(--radius-inner)] rounded-br-[6px] bg-near-ink px-3.5 py-2 text-[13.5px] leading-[21px] text-pure-snow">
                        {text}
                      </div>
                    </div>
                  </div>
                );
              }

              // Assistant message , render in a clean order regardless of
              // the part sequence: tool-status lines first (collapsed once
              // done), then the streamed text, then any rich result cards.
              const parts = message.parts as Array<{
                type: string;
                text?: string;
                toolCallId?: string;
                state?: string;
                input?: { summary?: string } & Record<string, unknown>;
                output?: unknown;
                error?: unknown;
              }>;
              const textParts: string[] = [];
              const toolExecutions: {
                id: string;
                label: string;
                state: "running" | "done" | "error" | "interrupted";
              }[] = [];
              const writeEls: React.ReactNode[] = [];
              // Interactive answer blocks (presentUi), drawn from the tool input.
              const uiEls: React.ReactNode[] = [];
              let partErrorMessage: string | null = null;
              // Collect pending updateTask confirmations so we can offer a
              // single "Confirm all" when the agent batches several.
              const pendingUpdateTasks: {
                toolName: string;
                callId: string;
                input: Record<string, unknown>;
              }[] = [];
              // Read tools chain (search → list → profile), each emitting a
              // card. Rendering one per call floods the message, so we keep
              // only the LAST completed read card , the one that actually
              // answers the turn. Status lines still show every step.
              let lastReadCard: React.ReactNode = null;

              parts.forEach((part, i) => {
                if (part.type === "text") {
                  if (part.text) textParts.push(part.text);
                  return;
                }
                if (part.type === "error") {
                  partErrorMessage = chatErrorMessage(part.error, t("unavailable"));
                  return;
                }
                if (!part.type.startsWith("tool-")) return;

                const toolName = part.type.slice("tool-".length);

                // Write tool → confirm card (inline with text flow).
                if (toolName === "presentUi") {
                  if (part.input) {
                    uiEls.push(
                      <UiBlocks
                        key={part.toolCallId ?? `ui-${i}`}
                        input={part.input}
                        onSend={send}
                        disabled={isBusy}
                      />,
                    );
                  }
                  return;
                }

                if (isAgentWriteTool(toolName)) {
                  if (!part.input || !part.toolCallId) return;
                  const callId = part.toolCallId;
                  const inputData = part.input;
                  writeEls.push(
                    <WriteConfirmCard
                      key={callId}
                      toolCallId={callId}
                      toolName={toolName}
                      summary={inputData.summary ?? t("confirmThisAction")}
                      input={inputData}
                      serverPreview={preparedWritePreviews[callId]}
                      done={writeResults[callId] ?? null}
                      pending={pendingWriteIds.has(callId)}
                      onConfirm={() =>
                        handleWriteConfirm(toolName, callId, inputData, true)
                      }
                      onCancel={() =>
                        handleWriteConfirm(toolName, callId, inputData, false)
                      }
                      onUndo={() => handleWriteUndo(callId)}
                    />,
                  );
                  if (
                    toolName === "updateTask" &&
                    !writeResults[callId] &&
                    inputData.taskId
                  ) {
                    pendingUpdateTasks.push({
                      toolName,
                      callId,
                      input: inputData,
                    });
                  }
                  return;
                }

                // Read tool → status line + (when done) a rich card.
                const label = getLocalizedToolLabel(
                  part.type,
                  (key) => t(`toolLabels.${key}`),
                  (name) => t("lookingAt", { name }),
                  t("working"),
                );
                if (part.state === "output-error") {
                  toolExecutions.push({
                    id: part.toolCallId ?? `s-${i}`,
                    label,
                    state: "error",
                  });
                  return;
                }
                if (part.state === "output-available" && part.output) {
                  const errored =
                    typeof part.output === "object" &&
                    part.output !== null &&
                    "error" in (part.output as Record<string, unknown>);
                  toolExecutions.push({
                    id: part.toolCallId ?? `s-${i}`,
                    label,
                    state: errored ? "error" : "done",
                  });
                  if (!errored) {
                    lastReadCard = (
                      <div key={`c-${part.toolCallId}`}>
                        <ToolResultCard
                          toolName={toolName}
                          output={part.output}
                        />
                      </div>
                    );
                  }
                  return;
                }
                if (
                  part.state === "input-streaming" ||
                  part.state === "input-available"
                ) {
                  toolExecutions.push({
                    id: `s-${i}`,
                    label,
                    // A part can stay input-available forever when the request
                    // was cut (route timeout) after the model emitted the
                    // call: show running only while the stream is alive.
                    state: isBusy ? "running" : "interrupted",
                  });
                }
              });

              const runningExecution = toolExecutions.find((e) => e.state === "running");
              const interruptedExecutions = toolExecutions.filter(
                (e) => e.state === "interrupted",
              );
              const hasErrors = toolExecutions.some((e) => e.state === "error");

              // One calm line: the live step while working; afterwards a quiet
              // "Checked X · N more" that expands to the full step list.
              let statusSection: React.ReactNode = null;
              const doneCount = toolExecutions.filter((e) => e.state === "done").length;
              if (runningExecution) {
                statusSection = (
                  <div className="flex items-center gap-2" aria-live="polite">
                    <ThinkingShimmer label={runningExecution.label} />
                    {doneCount > 0 ? (
                      <span className="text-[12px] text-quiet-mist">· {t("doneCount", { count: doneCount })}</span>
                    ) : null}
                  </div>
                );
              } else if (interruptedExecutions.length > 0) {
                statusSection = (
                  <div className="flex flex-col gap-1">
                    {interruptedExecutions.map((exec) => (
                      <ToolStatus key={exec.id} label={exec.label} state="interrupted" />
                    ))}
                  </div>
                );
              } else if (toolExecutions.length === 1) {
                statusSection = (
                  <ToolStatus
                    key={toolExecutions[0]!.id}
                    label={toolExecutions[0]!.label}
                    state={toolExecutions[0]!.state}
                  />
                );
              } else if (toolExecutions.length > 1) {
                const errorCount = toolExecutions.filter((e) => e.state === "error").length;
                const first = toolExecutions[0]!.label;
                statusSection = (
                  <details className="group text-[12px] text-soft-ink">
                    <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1.5 rounded-md transition-colors hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink [&::-webkit-details-marker]:hidden">
                      {hasErrors ? (
                        <PhWarning className="shrink-0 text-warning-clay" />
                      ) : (
                        <PhCheck className="shrink-0 text-success-olive" />
                      )}
                      <span>
                        {errorCount > 0
                          ? t("moreToolStatusesWithIssues", {
                              label: first,
                              count: toolExecutions.length - 1,
                              issues: errorCount,
                            })
                          : t("moreToolStatuses", { label: first, count: toolExecutions.length - 1 })}
                      </span>
                      <ChevronDown className="size-3 transition-transform duration-150 group-open:rotate-180" />
                    </summary>
                    <div className="mt-1.5 flex flex-col gap-1 border-l border-hairline pl-3">
                      {toolExecutions.map((exec) => (
                        <ToolStatus key={exec.id} label={exec.label} state={exec.state} />
                      ))}
                    </div>
                  </details>
                );
              }

              // Each agent step streams its own text part (before and after a
              // tool call); keep them as separate paragraphs, not "a.B".
              const fullText = textParts
                .map((part) => part.trim())
                .filter(Boolean)
                .join("\n\n");
              const textEl = fullText.trim() ? (
                <Markdown
                  key="text-body"
                  className="prose prose-sm max-w-none break-words [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto text-[13.5px] leading-[22px] text-near-ink prose-p:my-1 prose-headings:my-1.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-1.5"
                  components={MARKDOWN_COMPONENTS}
                >
                  {fullText}
                </Markdown>
              ) : null;

              // The request can be cut (route timeout, provider error, or step
              // budget) after tools finish: no text and no card. Say so
              // instead of ending the turn in silence. Also covers the case
              // where every tool completed cleanly and the final prose/apply
              // step never arrived.
              const wasCutOff = isStrandedAssistantTurn({
                isBusy,
                text: fullText,
                writeCardCount: writeEls.length + uiEls.length,
                toolExecutionCount: toolExecutions.length,
              });
              const cutoffEl = wasCutOff ? (
                <div
                  key="cutoff-notice"
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-snug text-soft-ink"
                  role="status"
                >
                  <span>{t("stoppedBeforeFinishingSelf")}</span>
                  <button
                    type="button"
                    onClick={continueConversation}
                    className="font-medium text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isBusy}
                  >
                    {t("continue")}
                  </button>
                </div>
              ) : null;
              // Error parts embedded in this message (stream-level useChat
              // `error` is rendered once below the transcript, not per turn).
              const messageErrorEl = partErrorMessage ? (
                <p
                  key="stream-error-notice"
                  className="text-[12px] leading-snug text-danger-rust"
                  role="alert"
                >
                  {partErrorMessage}
                </p>
              ) : null;

              return (
                <div key={message.id} className="flex items-start">
                  <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                    {statusSection}
                    {uiEls.length > 0 ? null : lastReadCard}
                    {textEl}
                    {uiEls}
                    {messageErrorEl}
                    {cutoffEl}
                    {writeEls}
                    {pendingUpdateTasks.length > 1 && (
                      <div
                        className="self-start rounded-lg border border-border/60 bg-muted/30 p-2"
                        role="group"
                        aria-label={t("batchConfirmation", { count: pendingUpdateTasks.length })}
                      >
                        <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">
                          {t("reviewTaskCards", { count: pendingUpdateTasks.length })}
                        </p>
                        <Button
                          size="sm"
                          className="h-7 px-3 text-xs"
                          disabled={
                            isBusy ||
                            pendingUpdateTasks.some((task) =>
                              pendingWriteIds.has(task.callId),
                            )
                          }
                          aria-label={t("confirmAllTasks", { count: pendingUpdateTasks.length })}
                          onClick={() => {
                            for (const t of pendingUpdateTasks) {
                              void handleWriteConfirm(
                                t.toolName,
                                t.callId,
                                t.input,
                                true,
                              );
                            }
                          }}
                        >
                          {t("confirmAllTasks", { count: pendingUpdateTasks.length })}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {status === "submitted" && (
              <div aria-live="polite">
                <ThinkingShimmer />
              </div>
            )}

            {/* Stream-level failure from useChat (route onError / network).
                Without this the panel swallows the server's friendly message
                and the turn looks like a silent non-answer. */}
            {error != null && !isBusy && (() => {
              const text = chatErrorMessage(error, t("unavailable"));
              return text ? (
                <div
                  className="flex items-start gap-2 rounded-[var(--radius-inner)] bg-danger-rust/10 px-3 py-2.5"
                  role="alert"
                >
                  <PhWarning className="mt-0.5 shrink-0 text-danger-rust" />
                  <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-danger-rust">{text}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2.5 text-[12.5px]"
                    onClick={retryLast}
                  >
                    {t("tryAgain")}
                  </Button>
                </div>
              ) : null;
            })()}

            <ChatContainerScrollAnchor />
          </ChatContainerContent>
        </ChatContainerRoot>

        {/* Input */}
        <div className="shrink-0 border-t border-hairline p-3">
          <div className="relative">
            {mentionCandidates.length > 0 ? (
              <div className="absolute inset-x-0 bottom-full z-10 mb-2 overflow-hidden rounded-[var(--radius-inner)] border border-hairline bg-popover p-1 shadow-[var(--shadow-float)]">
                <p className="type-col-head px-2 py-1">
                  {t("mentionCandidate")}
                </p>
                {mentionCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectMention(candidate)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent active:scale-[0.99]"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                      {candidate.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {candidate.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {candidate.email}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <PromptInput
              value={input}
              onValueChange={handleInputChange}
              onSubmit={submit}
              isLoading={isBusy}
              maxHeight={120}
              className="rounded-[var(--radius-inner)] border-mist-border bg-pure-snow px-3 py-2 shadow-none focus-within:border-near-ink focus-within:ring-3 focus-within:ring-near-ink/10"
            >
              <PromptInputTextarea
                placeholder={
                  surfaceContext?.kind === "candidate" && surfaceContext.label !== "Current candidate"
                    ? t("askAbout", { name: surfaceContext.label })
                    : t("askAssistant", { name: assistant.name })
                }
                className="min-h-[36px] bg-transparent py-1 text-base md:text-[13.5px] dark:bg-transparent"
              />
              <PromptInputActions className="items-center justify-between pt-1">
                <span className="text-[11.5px] text-quiet-mist">
                  {t("composerHint")}
                </span>
                <PromptInputAction tooltip={isBusy ? t("stop") : t("sendEnter")}>
                  {isBusy ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      onClick={() => void stop()}
                      aria-label={t("stop")}
                    >
                      <Square className="size-3 fill-current" strokeWidth={0} />
                    </Button>
                  ) : (
                    <Button
                      size="icon-sm"
                      onClick={submit}
                      aria-label={t("send")}
                      aria-disabled={!input.trim()}
                      className={cn(
                        !input.trim() && "pointer-events-none opacity-50",
                      )}
                    >
                      <ArrowUp className="size-3.5" strokeWidth={2.5} />
                    </Button>
                  )}
                </PromptInputAction>
              </PromptInputActions>
            </PromptInput>
            <PoweredByFootnote />
          </div>
        </div>
      </>
    </div>
  );
}

// ─── History drawer ───────────────────────────────────────────────────────────

function HistoryDrawer({
  open,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: {
  open: boolean;
  conversations: ConversationListItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("shell.harlyAI");
  const locale = useLocale();
  const relativeFormat = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  // eslint-disable-next-line react-hooks/purity -- relative time display, intentionally uses current time
  const now = Date.now();
  const relative = (iso: string) => {
    const diff = now - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return relativeFormat.format(0, "second");
    if (m < 60) return relativeFormat.format(-m, "minute");
    const h = Math.floor(m / 60);
    if (h < 24) return relativeFormat.format(-h, "hour");
    const d = Math.floor(h / 24);
    return d < 7
      ? relativeFormat.format(-d, "day")
      : new Date(iso).toLocaleDateString(locale, {
          month: "short",
          day: "numeric",
        });
  };

  return (
    <>
      {/* Scrim */}
      <div
        className={cn(
          "absolute inset-0 z-20 bg-foreground/10 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      {/* Panel sliding from the left, within the card */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 z-30 flex w-[290px] flex-col border-r border-border/70 bg-background shadow-xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-3">
          <span className="text-[12px] font-semibold tracking-tight">
            {t("chats")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            onClick={onClose}
            aria-label={t("closeHistory")}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="shrink-0 px-2 pt-2">
          <button
            type="button"
            onClick={onNew}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/70 px-2.5 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Plus className="size-3.5" />
            {t("newChat")}
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
              {t("noConversations")}
            </p>
          ) : (
            conversations.map((c, i) => (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-2 py-1.5 duration-300 animate-in fade-in slide-in-from-left-1 fill-mode-both",
                  c.id === activeId ? "bg-accent" : "hover:bg-accent/60",
                )}
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="flex min-w-0 flex-1 flex-col text-left"
                >
                  <span className="truncate text-[12px] font-medium text-foreground">
                    {c.title ?? t("newChat")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {relative(c.lastMessageAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:!text-rose-500"
                  aria-label={t("deleteConversation")}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ─── Panel shell (header + hamburger + conversation switching) ─────────────────

type HarlyAIPanelProps = {
  userName: string;
  persistenceKey: string;
  aiEnabled: boolean;
  canConfigureAi?: boolean;
  open: boolean;
  onClose: () => void;
  /** A question handed over from elsewhere (⌘K), sent once the chat is ready. */
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
  /** Candidate currently visible in the dashboard. */
  candidateId?: string;
  surfaceContext?: {
    kind: "candidate" | "section";
    label: string;
    path: string;
  };
  automationContext?: AutomationContext;
  /** Lets an embedded Builder reconcile its canvas after a confirmed AI proposal. */
  onAutomationApplied?: (result: {
    workflowId: string;
    draftRevision?: number;
  }) => void | Promise<void>;
};

function freshId(): string {
  return randomId();
}

export function HarlyAIPanel({
  userName,
  persistenceKey,
  aiEnabled,
  canConfigureAi = false,
  open,
  onClose,
  pendingPrompt,
  onPendingPromptConsumed,
  candidateId,
  surfaceContext,
  automationContext,
  onAutomationApplied,
}: HarlyAIPanelProps) {
  const t = useTranslations("shell.harlyAI");
  const [conversationId, setConversationId] = useState<string>(() => freshId());
  const [initialMessages, setInitialMessages] = useState<StoredUIMessage[]>([]);
  const [restoredPersistenceKey, setRestoredPersistenceKey] = useState<
    string | null
  >(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const confirm = useConfirm();
  const { assistant } = useHarlyAI();

  useEffect(() => {
    let cancelled = false;
    const storedId = window.sessionStorage.getItem(
      `harly-ai:conversation:${persistenceKey}`,
    );
    if (!storedId) {
      queueMicrotask(() => {
        if (!cancelled) setRestoredPersistenceKey(persistenceKey);
      });
      return () => {
        cancelled = true;
      };
    }

    // A failed restore (expired session, AI turned off) must not leave the
    // panel stuck on "Restoring…": fall back to a fresh conversation.
    void loadConversationAction(storedId)
      .then((messages) => {
        if (cancelled || !messages) return;
        setConversationId(storedId);
        setInitialMessages(messages);
      })
      .catch(() => {
        window.sessionStorage.removeItem(`harly-ai:conversation:${persistenceKey}`);
      })
      .finally(() => {
        if (!cancelled) setRestoredPersistenceKey(persistenceKey);
      });

    return () => {
      cancelled = true;
    };
  }, [persistenceKey]);

  const restoringConversation = restoredPersistenceKey !== persistenceKey;

  useEffect(() => {
    if (!restoringConversation) {
      window.sessionStorage.setItem(
        `harly-ai:conversation:${persistenceKey}`,
        conversationId,
      );
    }
  }, [conversationId, persistenceKey, restoringConversation]);

  const refreshList = useCallback(async () => {
    const list = await listConversationsAction();
    setConversations(list);
  }, []);

  // Load the conversation list when the panel first opens with AI enabled.
  useEffect(() => {
    if (open && aiEnabled) queueMicrotask(() => void refreshList());
  }, [open, aiEnabled, refreshList]);

  function startNewChat() {
    setConversationId(freshId());
    setInitialMessages([]);
    setHistoryOpen(false);
  }

  async function openConversation(id: string) {
    const msgs = await loadConversationAction(id);
    setInitialMessages(msgs ?? []);
    setConversationId(id);
    setHistoryOpen(false);
  }

  async function removeConversation(id: string) {
    const ok = await confirm({
      tone: "destructive",
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirmDescription"),
      confirmLabel: t("deleteConversation"),
    });
    if (!ok) return;
    await deleteConversationAction(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === conversationId) startNewChat();
  }

  // Escape closes; opening moves focus to the composer, closing hands it back
  // to whatever opened the panel (the launcher, ⌘J, the command menu).
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) onCloseRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  // The recruiter can detach the conversation from the page they're on.
  const [detachedPath, setDetachedPath] = useState<string | null>(null);
  const attached = surfaceContext && detachedPath !== surfaceContext.path;
  const effectiveContext = attached ? surfaceContext : undefined;
  const effectiveCandidateId = attached ? candidateId : undefined;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={assistant.name}
      className={cn(
        "fixed bottom-[84px] left-3 right-3 z-50 w-auto text-sm leading-6 transition-[opacity,transform] duration-200 ease-out sm:left-auto sm:right-6 sm:w-[420px] motion-reduce:transition-none",
        open
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "invisible translate-y-3 opacity-0 pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <Card className="relative flex h-[min(600px,calc(100dvh-7.5rem))] flex-col gap-0 overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-pure-snow p-0 py-0 shadow-[var(--shadow-float)]">
        {/* Header */}
        <div className="shrink-0 border-b border-hairline px-3 pt-2.5 pb-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {assistant.avatarUrl ? (
                <AssistantAvatar avatarUrl={assistant.avatarUrl} size={20} className="size-5 shrink-0 rounded-full" />
              ) : (
                <HarlyAILogoMark className="size-5 shrink-0" />
              )}
              <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-near-ink">{assistant.name}</span>
            </div>
            <div className="flex items-center gap-0.5">
              {aiEnabled ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-soft-ink"
                    onClick={() => setHistoryOpen(true)}
                    aria-label={t("chatHistory")}
                    title={t("chatHistory")}
                  >
                    <History className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-soft-ink"
                    onClick={startNewChat}
                    aria-label={t("newChat")}
                    title={t("newChat")}
                  >
                    <Plus className="size-4" />
                  </Button>
                </>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-soft-ink"
                onClick={onClose}
                aria-label={t("closeAssistant", { name: assistant.name })}
                title={t("closeEsc")}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
          {aiEnabled && surfaceContext ? (
            <div className="mt-2 flex items-center gap-1.5">
              {attached ? (
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-lime-wash py-0.5 pl-2 pr-1 text-[12px] font-medium text-sage-ink">
                  {surfaceContext.kind === "candidate" ? (
                    <UserRound className="size-3.5 shrink-0" strokeWidth={2} />
                  ) : (
                    <LayoutGrid className="size-3.5 shrink-0" strokeWidth={2} />
                  )}
                  <span className="truncate">{surfaceContext.label}</span>
                  <button
                    type="button"
                    onClick={() => setDetachedPath(surfaceContext.path)}
                    className="grid size-4 place-items-center rounded-full hover:bg-sage-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                    aria-label={t("stopUsingContext", { name: surfaceContext.label })}
                  >
                    <X className="size-3" strokeWidth={2.2} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setDetachedPath(null)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-mist-border px-2 py-0.5 text-[12px] text-soft-ink hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                >
                  <Plus className="size-3" strokeWidth={2.2} />
                  {t("useContext", { name: surfaceContext.label })}
                </button>
              )}
            </div>
          ) : null}
        </div>

        {!aiEnabled ? (
          <div className="flex flex-1 items-center justify-center">
            <NotConfiguredState canConfigure={canConfigureAi} />
          </div>
        ) : (
          <>
            {restoringConversation ? (
              <div className="flex flex-1 items-center justify-center">
                <ThinkingShimmer label={t("restoringChat")} />
              </div>
            ) : (
              <HarlyChat
                key={conversationId}
                conversationId={conversationId}
                initialMessages={initialMessages}
                userName={userName}
                candidateId={effectiveCandidateId}
                surfaceContext={effectiveContext}
                automationContext={automationContext}
                onAutomationApplied={onAutomationApplied}
                onConversationActivity={refreshList}
                pendingPrompt={pendingPrompt}
                onPendingPromptConsumed={onPendingPromptConsumed}
              />
            )}
            <HistoryDrawer
              open={historyOpen}
              conversations={conversations}
              activeId={conversationId}
              onSelect={openConversation}
              onNew={startNewChat}
              onDelete={(id) => void removeConversation(id)}
              onClose={() => setHistoryOpen(false)}
            />
          </>
        )}
      </Card>
    </div>
  );
}

// The launcher lives in HarlyAILauncher (bottom-right), rendered by
// HarlyAIProvider; ⌘J and the command menu's "Ask Harly AI" open it too.
