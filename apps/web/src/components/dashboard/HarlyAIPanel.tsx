"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  X,
  ArrowUp,
  Check,
  Paperclip,
  Settings,
  Square,
  PanelLeft,
  Plus,
  Trash2,
  MessageSquare,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HarlyAILogoMark } from "@/components/ui/icons/HarlyAILogoMark";
import { Markdown } from "@/components/ui/markdown";
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

const PhFunnel = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 256 256"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      d="M230.6 49.53A15.81 15.81 0 0 0 216 40H40a16 16 0 0 0-11.81 26.76l.08.09L96 139.17V216a16 16 0 0 0 24.87 13.32l32-21.34a16 16 0 0 0 7.13-13.32v-55.49l67.74-72.32l.08-.09a15.8 15.8 0 0 0 2.78-17.23m-84.42 81.05A8 8 0 0 0 144 136v58.66L112 216v-80a8 8 0 0 0-2.16-5.47L40 56h176Z"
    />
  </svg>
);
const PhEnvelope = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 256 256"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      d="M224 48H32a8 8 0 0 0-8 8v136a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V56a8 8 0 0 0-8-8m-96 85.15L52.57 64h150.86ZM98.71 128L40 181.81V74.19Zm11.84 10.85l12 11.05a8 8 0 0 0 10.82 0l12-11.05l58 53.15H52.57ZM157.29 128L216 74.18v107.64Z"
    />
  </svg>
);
const PhUserCheck = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 256 256"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      d="M144 157.68a68 68 0 1 0-71.9 0c-20.65 6.76-39.23 19.39-54.17 37.17a8 8 0 0 0 12.25 10.3C50.25 181.19 77.91 168 108 168s57.75 13.19 77.87 37.15a8 8 0 0 0 12.25-10.3c-14.94-17.78-33.52-30.41-54.12-37.17M56 100a52 52 0 1 1 52 52a52.06 52.06 0 0 1-52-52m197.66 33.66l-32 32a8 8 0 0 1-11.32 0l-16-16a8 8 0 0 1 11.32-11.32L216 148.69l26.34-26.35a8 8 0 0 1 11.32 11.32"
    />
  </svg>
);
const PhChartBar = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 256 256"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      d="M224 200h-8V40a8 8 0 0 0-8-8h-56a8 8 0 0 0-8 8v40H96a8 8 0 0 0-8 8v40H48a8 8 0 0 0-8 8v64h-8a8 8 0 0 0 0 16h192a8 8 0 0 0 0-16M160 48h40v152h-40Zm-56 48h40v104h-40Zm-48 48h32v56H56Z"
    />
  </svg>
);
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

const QUICK_PROMPTS = [
  { icon: PhFunnel, label: "How's my pipeline?", color: "text-blue-500" },
  { icon: PhUserCheck, label: "Who needs review?", color: "text-green-500" },
  {
    icon: PhChartBar,
    label: "Show my hiring report",
    color: "text-purple-500",
  },
  {
    icon: PhEnvelope,
    label: "Which jobs are at risk?",
    color: "text-orange-500",
  },
];

// Human labels for the "calling a tool" inline state.
const TOOL_LABELS: Record<string, string> = {
  "tool-reviewPipeline": "Reading your pipeline",
  "tool-candidatesNeedingReview": "Finding candidates to review",
  "tool-jobsAtRisk": "Checking jobs at risk",
  "tool-hiringReport": "Pulling your hiring report",
  "tool-searchCandidates": "Searching",
  "tool-listCandidates": "Listing candidates",
  "tool-candidateProfile": "Reading the candidate profile",
  "tool-listJobs": "Listing jobs",
  "tool-jobDetail": "Reading the job",
  "tool-upcomingInterviews": "Checking upcoming interviews",
  "tool-todayInterviews": "Checking today's interviews",
  "tool-listTasks": "Reading tasks",
  "tool-taskCounts": "Counting tasks",
  "tool-inbox": "Checking your inbox",
  "tool-getCandidateScore": "Reading the AI score",
  "tool-candidateScorecards": "Reading team scorecards",
  "tool-listCandidateOffers": "Checking offers",
  "tool-talentPool": "Browsing the talent pool",
  "tool-listEmailTemplates": "Listing email templates",
  "tool-emailTemplate": "Reading the template",
  "tool-reportsOverview": "Pulling the analytics report",
  "tool-generateCandidateScore": "Generating the AI score",
  "tool-draftCandidateEmail": "Drafting the email",
  "tool-generateJobDraft": "Writing the job description",
  "tool-generateScreeningQuestions": "Generating screening questions",
  "tool-interviewBrief": "Preparing the interview brief",
  "tool-summarizeInterviewNotes": "Summarizing the notes",
  "tool-detectDuplicates": "Checking for duplicates",
  "tool-compareCandidates": "Comparing candidates",
  "tool-bulkScoreJob": "Scoring all applicants",
  "tool-recentAgentActions": "Checking recent Harly actions",
};

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

function ThinkingShimmer({ label = "Thinking" }: { label?: string }) {
  return (
    <span
      className="bg-[length:200%_100%] bg-clip-text text-[13px] font-medium text-transparent animate-shimmer"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--muted-foreground) 0%, var(--muted-foreground) 40%, var(--foreground) 50%, var(--muted-foreground) 60%, var(--muted-foreground) 100%)",
      }}
    >
      {label}…
    </span>
  );
}

function ToolStatus({
  label,
  state,
}: {
  label: string;
  state: "running" | "done" | "error";
}) {
  if (state === "running") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/50" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        <span
          className="bg-[length:200%_100%] bg-clip-text text-[12px] font-medium text-transparent animate-shimmer"
          style={{
            backgroundImage:
              "linear-gradient(90deg, var(--muted-foreground) 0%, var(--muted-foreground) 40%, var(--foreground) 50%, var(--muted-foreground) 60%, var(--muted-foreground) 100%)",
          }}
        >
          {label}…
        </span>
      </div>
    );
  }
  // Collapsed once finished , a quiet one-liner.
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {state === "error" ? (
        <PhWarning className="shrink-0 text-rose-500" />
      ) : (
        <PhCheck className="shrink-0 text-emerald-500" />
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
  "bg-blue-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-cyan-500",
];

const REC_TONE: Record<string, string> = {
  strong_yes: "text-emerald-600 dark:text-emerald-400",
  yes: "text-emerald-600 dark:text-emerald-400",
  maybe: "text-amber-600 dark:text-amber-400",
  no: "text-rose-600 dark:text-rose-400",
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
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 duration-300 animate-in fade-in slide-in-from-bottom-1 fill-mode-both",
        onClick && "cursor-pointer transition-colors hover:bg-accent/60",
      )}
      style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
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

function ToolResultCard({
  toolName,
  output,
}: {
  toolName: string;
  output: unknown;
}) {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;

  if (toolName === "recentAgentActions" && Array.isArray(o.actions)) {
    const labelFor = (name: unknown) => {
      const labels: Record<string, string> = {
        moveCandidateStage: "Moved candidate",
        rejectCandidate: "Rejected candidate",
        createTask: "Created task",
        updateTask: "Updated task",
        completeMyOpenTasks: "Completed open tasks",
        createJob: "Created draft job",
        addCandidateNote: "Added candidate note",
        addCandidateTag: "Added candidate tag",
        createOffer: "Created draft offer",
        sendOffer: "Sent offer",
        decideOffer: "Recorded offer decision",
        scheduleInterview: "Scheduled interview",
        addToTalentPool: "Added candidate to talent pool",
        assignFromPoolToJob: "Assigned candidate to job",
        createScorecard: "Created scorecard",
        sendCandidateEmail: "Sent candidate email",
        undoAgentAction: "Undid an action",
      };
      if (typeof name !== "string") return "Harly action";
      return labels[name] ?? name.replace(/([a-z])([A-Z])/g, "$1 $2");
    };
    const actions = o.actions as Array<Record<string, unknown>>;
    return (
      <Card className="gap-0 border-border/70 p-2 shadow-none">
        {actions.length === 0 ? (
          <span className="px-1 py-0.5 text-[12px] text-muted-foreground">
            No recent actions.
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
                ? "In progress"
                : success === true
                  ? "Done"
                  : success === false
                    ? "Failed"
                    : "Unknown";
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
                    Undo available
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
            {job ?? "Pipeline"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {String(o.totalActive ?? 0)} active
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
    const tone =
      score >= 80
        ? "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400"
        : score >= 60
          ? "from-blue-500/15 to-blue-500/5 text-blue-600 dark:text-blue-400"
          : score >= 40
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
              {rec.replace(/_/g, " ") || "Scored"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              AI fit score · out of 100
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
      applications: "Applications",
      interviews: "Interviews",
      hires: "Hires",
      offerAcceptance: "Offer accept.",
    };
    return (
      <Card className="grid grid-cols-2 gap-2 border-border/70 p-3 shadow-none">
        {Object.entries(metrics).map(([key, m]) => (
          <div key={key} className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">
              {labels[key] ?? key}
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
            +{list.length - 8} more
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
              <span>{j.activeApplicants} active</span>
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
        ? date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })
        : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
                {iv.candidate ?? "Unknown candidate"}
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
          const title = String(it.title ?? it.label ?? it.candidate ?? "Item");
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
                    ? `/${of.salaryPeriod === "annual" ? "yr" : "mo"}`
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
            Talent pool
          </span>
          <span className="text-[11px] text-muted-foreground">
            {String(o.total ?? list.length)} total
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
            ["Open roles", s.openRoles],
            ["Candidates", s.totalCandidates],
            ["Apps (90d)", s.applications90d],
            ["Hires", s.hires],
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
    const tone = (score: number) =>
      score >= 80
        ? "text-emerald-600 dark:text-emerald-400"
        : score >= 60
          ? "text-blue-600 dark:text-blue-400"
          : score >= 40
            ? "text-amber-600 dark:text-amber-400"
            : "text-rose-600 dark:text-rose-400";
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
                {c.recommendation.replace(/_/g, " ")}
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
            Subject
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
            <PhCheck className="shrink-0" /> No duplicates found.
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
              {m.confidence}
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
          <span className="text-[11px] text-muted-foreground">scored</span>
        </div>
        {Number(o.failed ?? 0) > 0 && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">
              {String(o.failed)}
            </span>
            <span className="text-[11px] text-muted-foreground">failed</span>
          </div>
        )}
        {Number(o.remaining ?? 0) > 0 && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tabular-nums">
              {String(o.remaining)}
            </span>
            <span className="text-[11px] text-muted-foreground">remaining</span>
          </div>
        )}
      </Card>
    );
  }

  return null;
}

function EvidenceMeta({ output }: { output: unknown }) {
  if (!output || typeof output !== "object") return null;
  const value = output as Record<string, unknown>;
  if (
    typeof value.source !== "string" ||
    typeof value.observedAt !== "string"
  ) {
    return null;
  }

  const observed = new Date(value.observedAt);
  const observedLabel = Number.isNaN(observed.getTime())
    ? value.observedAt
    : observed.toLocaleString();
  const confidence =
    typeof value.confidence === "string" ? value.confidence : null;
  const limitations = Array.isArray(value.limitations)
    ? value.limitations.filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[10px] text-muted-foreground">
      <span>Fuente: {value.source}</span>
      <span aria-hidden="true">·</span>
      <span>Observado: {observedLabel}</span>
      {confidence ? <span>· Confianza: {confidence}</span> : null}
      {limitations.length > 0 ? (
        <span title={limitations.join(" ")}>· Tiene límites</span>
      ) : null}
    </div>
  );
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

function formatMoney(input: Record<string, unknown>): string | null {
  const amount = input.salaryAmount;
  if (typeof amount !== "number") return null;

  const currency = optionalText(input.currency) ?? "";
  const period =
    input.salaryPeriod === "annual"
      ? "/ year"
      : input.salaryPeriod === "monthly"
        ? "/ month"
        : "";
  return `${currency ? `${currency} ` : ""}${amount.toLocaleString()}${period}`;
}

function getWriteActionPreview(
  toolName: string,
  input: Record<string, unknown>,
): { title: string; details: WriteActionDetail[] } {
  const detail = (label: string, value: string | null): WriteActionDetail[] =>
    value ? [{ label, value }] : [];
  const taskIds = Array.isArray(input.taskIds)
    ? input.taskIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];

  switch (toolName) {
    case "undoAgentAction":
      return { title: "Undo action", details: [] };
    case "moveCandidateStage":
      return {
        title: "Move candidate",
        details: [
          ...detail("Candidate", optionalText(input.candidateName)),
          ...detail("From", optionalText(input.fromStageName)),
          ...detail("To", optionalText(input.toStageName)),
        ],
      };
    case "rejectCandidate":
      return { title: "Reject candidate", details: [] };
    case "createTask":
      return {
        title: "Create task",
        details: [
          ...detail("Task", optionalText(input.title)),
          ...detail("Priority", optionalText(input.priority)),
          ...detail("Due", formatDateTime(input.dueDate)),
        ],
      };
    case "updateTask": {
      const count = taskIds.length || (optionalText(input.taskId) ? 1 : 0);
      const changes = [
        input.status
          ? `Status: ${String(input.status).replace(/_/g, " ")}`
          : null,
        optionalText(input.title)
          ? `Title: ${optionalText(input.title)}`
          : null,
        input.priority ? `Priority: ${String(input.priority)}` : null,
        input.clearDueDate === true
          ? "Due date: remove"
          : formatDateTime(input.dueDate)
            ? `Due date: ${formatDateTime(input.dueDate)}`
            : null,
        optionalText(input.ownerId) ? "Owner: change" : null,
      ].filter((change): change is string => Boolean(change));
      return {
        title: count > 1 ? `Update ${count} tasks` : "Update task",
        details: [
          ...detail(
            "Affected",
            count ? `${count} task${count === 1 ? "" : "s"}` : null,
          ),
          ...detail("Changes", changes.join(", ") || null),
        ],
      };
    }
    case "createJob":
      return {
        title: "Create draft job",
        details: [
          ...detail("Role", optionalText(input.title)),
          ...detail("Workplace", optionalText(input.workplaceType)),
          ...detail(
            "Employment",
            optionalText(input.employmentType)?.replace(/_/g, " ") ?? null,
          ),
          ...detail("Location", optionalText(input.location)),
        ],
      };
    case "addCandidateNote":
      return {
        title: "Add candidate note",
        details: detail(
          "Note",
          optionalText(input.body)?.slice(0, 180) ?? null,
        ),
      };
    case "addCandidateTag":
      return {
        title: "Add candidate tag",
        details: detail("Tag", optionalText(input.label)),
      };
    case "createOffer":
      return {
        title: "Create draft offer",
        details: [
          ...detail("Role", optionalText(input.title)),
          ...detail("Compensation", formatMoney(input)),
          ...detail("Start date", formatDateTime(input.startDate)),
          ...detail("Expires", formatDateTime(input.expiresAt)),
        ],
      };
    case "sendOffer":
      return { title: "Send offer", details: [] };
    case "decideOffer":
      return {
        title: "Record offer decision",
        details: detail("Decision", optionalText(input.decision)),
      };
    case "scheduleInterview":
      return {
        title: "Schedule interview",
        details: [
          ...detail(
            "Type",
            optionalText(input.type)?.replace(/_/g, " ") ?? null,
          ),
          ...detail("When", formatDateTime(input.scheduledAt)),
          ...detail(
            "Duration",
            typeof input.durationMins === "number"
              ? `${input.durationMins} minutes`
              : null,
          ),
          ...detail("Mode", optionalText(input.mode)),
        ],
      };
    case "addToTalentPool":
      return {
        title: "Add candidate to talent pool",
        details: [
          ...detail("Source", optionalText(input.source)),
          ...detail("Reason", optionalText(input.reason)),
        ],
      };
    case "assignFromPoolToJob":
      return { title: "Assign candidate to job", details: [] };
    case "createScorecard":
      return {
        title: "Create scorecard",
        details: [
          ...detail("Rating", optionalText(input.rating)),
          ...detail("Stage", optionalText(input.stageName)),
          ...detail(
            "Comment",
            optionalText(input.comment)?.slice(0, 180) ?? null,
          ),
        ],
      };
    case "sendCandidateEmail":
      return {
        title: "Send candidate email",
        details: [
          ...detail("To", optionalText(input.toEmail)),
          ...detail("Subject", optionalText(input.subject)),
        ],
      };
    case "generateCandidateScore":
      return {
        title: "Generate candidate evaluation",
        details: [
          ...detail("Candidate", optionalText(input.candidateName)),
          ...detail("Role", optionalText(input.jobTitle)),
          { label: "Data sent", value: "Resume and application answers" },
        ],
      };
    case "bulkScoreJob":
      return {
        title: "Evaluate applicants",
        details: [
          ...detail("Role", optionalText(input.jobTitle)),
          { label: "Scope", value: "All currently unscored applicants" },
          { label: "Data sent", value: "Resumes and application answers" },
        ],
      };
    default:
      return { title: "Confirm action", details: [] };
  }
}

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
  const isMove = toolName === "moveCandidateStage";
  const from = String(input.fromStageName ?? "");
  const to = String(input.toStageName ?? "");
  const who = String(input.candidateName ?? "");
  const localPreview = getWriteActionPreview(toolName, input);
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
  ].includes(toolName);
  const verifying =
    requiresCanonicalPreview &&
    (!serverPreview || serverPreview.title === "Verifying action…");
  const preview = verifying
    ? { title: "Verifying action…", details: [] }
    : serverPreview?.canonical && serverPreview.ok
      ? serverPreview
      : localPreview;
  const titleId = `write-action-${toolCallId}`;

  if (done) {
    return (
      <div
        className="overflow-hidden rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-[12px] duration-200 animate-in fade-in slide-in-from-bottom-1"
        role={done.error ? "alert" : "status"}
        aria-live={done.error ? "assertive" : "polite"}
      >
        {done.confirmed && !done.error ? (
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5 shrink-0" />
            <span>{done.message ?? "Done."}</span>
          </div>
        ) : done.error ? (
          <span className="text-destructive">{done.error}</span>
        ) : (
          <span className="text-muted-foreground">Cancelled.</span>
        )}
        {/* On a successful move, show the stage path as confirmation. */}
        {isMove && done.confirmed && !done.error && from && to && (
          <div className="mt-2">
            <StagePath from={from} to={to} animate />
          </div>
        )}
        {done.confirmed && done.undoable && !done.undone && onUndo ? (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 px-2 text-xs"
            onClick={onUndo}
            disabled={done.undoing}
          >
            {done.undoing ? "Undoing…" : "Undo"}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm duration-200 animate-in fade-in slide-in-from-bottom-1"
      aria-labelledby={titleId}
      aria-busy={pending}
    >
      <div className="space-y-2.5 px-3 py-2.5">
        <div className="space-y-0.5">
          <h3
            id={titleId}
            className="text-[13px] font-semibold leading-snug text-foreground"
          >
            {preview.title}
          </h3>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Review the exact changes below before confirming.
          </p>
        </div>
        {requiresCanonicalPreview &&
        serverPreview &&
        !serverPreview.ok &&
        !verifying ? (
          <p
            className="rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] leading-snug text-destructive"
            role="alert"
          >
            {serverPreview.error ?? "The action could not be verified."}
          </p>
        ) : (
          preview.details.length > 0 && (
            <dl className="space-y-1.5 rounded-lg bg-muted/45 px-2.5 py-2 text-[11px] leading-snug">
              {preview.details.map((item) => (
                <div
                  key={item.label}
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2"
                >
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd className="min-w-0 break-words font-medium text-foreground">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          )
        )}
        {summary && (
          <p className="text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium text-foreground/80">
              Agent summary:
            </span>{" "}
            {summary}
          </p>
        )}
        {isMove && who && from && to && (
          <div>
            <StagePath from={from} to={to} />
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t border-border/50 bg-muted/30 px-3 py-2">
        <Button
          size="sm"
          className="h-7 flex-1 px-3 text-xs"
          onClick={onConfirm}
          disabled={
            pending || verifying || Boolean(serverPreview && !serverPreview.ok)
          }
          aria-label={`Confirm: ${preview.title}`}
        >
          {pending ? "Working…" : "Confirm"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-3 text-xs"
          onClick={onCancel}
          disabled={pending}
          aria-label={`Cancel: ${preview.title}`}
        >
          Cancel
        </Button>
      </div>
    </section>
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
  onPromptClick,
}: {
  firstName: string;
  onPromptClick: (p: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5 px-4 py-10 text-center">
      <Image
        src="/harly-ai-animado.svg"
        alt="Harly AI"
        width={88}
        height={88}
        unoptimized
        priority
      />
      <div className="flex flex-col gap-1">
        <h2 className="text-[18px] font-semibold tracking-[-0.01em]">
          Hi {firstName} 👋
        </h2>
        <p className="text-[13px] text-muted-foreground">
          What can I help you with today?
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {QUICK_PROMPTS.map(({ icon: Icon, label, color }, i) => (
          <button
            key={label}
            type="button"
            onClick={() => onPromptClick(label)}
            className="flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 text-[12px] font-medium text-foreground/80 duration-300 animate-in fade-in slide-in-from-bottom-1 fill-mode-both transition-[background-color,border-color,color,transform] hover:-translate-y-[1px] hover:border-primary/30 hover:bg-muted/60 hover:text-foreground"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className={cn("shrink-0", color)}>
              <Icon />
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NotConfiguredState() {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <Image
        src="/harly-ai-animado.svg"
        alt="Harly AI"
        width={72}
        height={72}
        unoptimized
        priority
      />
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-semibold tracking-tight">
          Harly AI isn&apos;t set up yet
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Connect an AI provider key to start chatting with your hiring copilot.
        </p>
      </div>
      <Button asChild size="sm" className="gap-1.5">
        <Link href="/settings/ai">
          <Settings className="size-3.5" />
          Open AI settings
        </Link>
      </Button>
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
  onConversationActivity: () => void;
};

function HarlyChat({
  conversationId,
  initialMessages,
  userName,
  candidateId,
  surfaceContext,
  onConversationActivity,
}: HarlyChatProps) {
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
  const pendingWriteIdsRef = useRef(new Set<string>());
  const firstName = userName.split(" ")[0] ?? userName;
  const notifiedRef = useRef(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { messages, sendMessage, addToolOutput, status, stop } = useChat({
    id: conversationId,
    messages: initialMessages as never,
    transport: new DefaultChatTransport({
      api: "/api/ai/chat",
      body: {
        conversationId,
        candidateId,
        mentionedCandidateIds: Object.keys(mentionedCandidates),
        surfaceContext,
        timeZone,
      },
    }),
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const pending: Array<{
      id: string;
      tool: string;
      input: Record<string, unknown>;
    }> = [];
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts as Array<{
        type?: string;
        toolCallId?: string;
        input?: Record<string, unknown>;
      }>) {
        const tool = part.type?.startsWith("tool-")
          ? part.type.slice("tool-".length)
          : "";
        if (tool && part.toolCallId && part.input && isAgentWriteTool(tool)) {
          pending.push({ id: part.toolCallId, tool, input: part.input });
        }
      }
    }
    for (const item of pending) {
      if (preparedWritePreviews[item.id]) continue;
      setPreparedWritePreviews((previous) => ({
        ...previous,
        [item.id]: { ok: false, title: "Verifying action…", details: [] },
      }));
      void prepareAgentWriteAction(item.tool, item.input).then((preview) => {
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

  function submit() {
    const text = input.trim();
    if (!text || isBusy) return;
    sendMessage({ text });
    setInput("");
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
      const res = await confirmAgentWriteAction(toolName, rawInput, toolCallId);
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
          : { confirmed: true, error: res.error ?? "Action failed." },
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
          ? (result.message ?? "Action undone.")
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
                onPromptClick={(p) => setInput(p)}
              />
            )}

            {messages.map((message) => {
              if (message.role === "user") {
                const text = message.parts
                  .filter((p) => p.type === "text")
                  .map((p) => (p as { text: string }).text)
                  .join("");
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-[13px] leading-[22px] text-primary-foreground">
                      {text}
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
              }>;
              const statusEls: React.ReactNode[] = [];
              const textEls: React.ReactNode[] = [];
              const writeEls: React.ReactNode[] = [];
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
                  textEls.push(
                    <Markdown
                      key={`t-${i}`}
                      className="prose prose-sm max-w-none text-[13px] leading-[22px] text-foreground prose-p:my-1 prose-headings:my-1.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-1.5"
                      components={MARKDOWN_COMPONENTS}
                    >
                      {part.text ?? ""}
                    </Markdown>,
                  );
                  return;
                }
                if (!part.type.startsWith("tool-")) return;

                const toolName = part.type.slice("tool-".length);

                // Write tool → confirm card (inline with text flow).
                if (isAgentWriteTool(toolName)) {
                  if (!part.input || !part.toolCallId) return;
                  const callId = part.toolCallId;
                  const inputData = part.input;
                  writeEls.push(
                    <WriteConfirmCard
                      key={callId}
                      toolCallId={callId}
                      toolName={toolName}
                      summary={inputData.summary ?? "Confirm this action?"}
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
                const label = TOOL_LABELS[part.type] ?? "Working";
                if (part.state === "output-available" && part.output) {
                  const errored =
                    typeof part.output === "object" &&
                    part.output !== null &&
                    "error" in (part.output as Record<string, unknown>);
                  statusEls.push(
                    <ToolStatus
                      key={`s-${part.toolCallId}`}
                      label={label}
                      state={errored ? "error" : "done"}
                    />,
                  );
                  if (!errored) {
                    lastReadCard = (
                      <div key={`c-${part.toolCallId}`}>
                        <EvidenceMeta output={part.output} />
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
                  statusEls.push(
                    <ToolStatus key={`s-${i}`} label={label} state="running" />,
                  );
                }
              });

              return (
                <div key={message.id} className="flex items-start gap-2">
                  <Image
                    src="/harly-ai-animado.svg"
                    alt="Harly AI"
                    width={18}
                    height={18}
                    unoptimized
                    className="mt-1 shrink-0"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {statusEls.length > 0 && (
                      <div className="flex flex-col gap-1">{statusEls}</div>
                    )}
                    {lastReadCard}
                    {textEls}
                    {writeEls}
                    {pendingUpdateTasks.length > 1 && (
                      <div
                        className="self-start rounded-lg border border-border/60 bg-muted/30 p-2"
                        role="group"
                        aria-label={`Batch confirmation for ${pendingUpdateTasks.length} task updates`}
                      >
                        <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">
                          Review each task card, then confirm all{" "}
                          {pendingUpdateTasks.length} updates together.
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
                          aria-label={`Confirm all ${pendingUpdateTasks.length} task updates`}
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
                          Confirm all {pendingUpdateTasks.length} updates
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {status === "submitted" && (
              <div className="flex items-center gap-2">
                <Image
                  src="/harly-ai-animado.svg"
                  alt="Harly AI"
                  width={18}
                  height={18}
                  unoptimized
                  className="shrink-0"
                />
                <ThinkingShimmer />
              </div>
            )}

            <ChatContainerScrollAnchor />
          </ChatContainerContent>
        </ChatContainerRoot>

        {/* Input */}
        <div className="shrink-0 border-t border-border/60 p-3">
          <div className="relative">
            {mentionCandidates.length > 0 ? (
              <div className="absolute inset-x-0 bottom-full z-10 mb-2 overflow-hidden rounded-xl border border-border/70 bg-popover p-1 shadow-lg">
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Mention candidate
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
              className="rounded-3xl border-border/60 bg-muted/30 px-3 py-2 shadow-none"
            >
              <PromptInputTextarea
                placeholder="Ask Harly AI… Use @ to mention a candidate"
                className="min-h-[36px] bg-transparent py-1 text-[13px] dark:bg-transparent"
              />
              <PromptInputActions className="justify-between pt-1">
                <PromptInputAction tooltip="Attach files (coming soon)">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled
                    className="cursor-not-allowed text-muted-foreground/50"
                    aria-label="Attach files (coming soon)"
                  >
                    <Paperclip className="size-3.5" />
                  </Button>
                </PromptInputAction>
                <PromptInputAction tooltip={isBusy ? "Stop" : "Send (Enter)"}>
                  {isBusy ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      onClick={() => void stop()}
                      aria-label="Stop"
                    >
                      <Square className="size-3 fill-current" strokeWidth={0} />
                    </Button>
                  ) : (
                    <Button
                      size="icon-sm"
                      onClick={submit}
                      aria-label="Send"
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
  // eslint-disable-next-line react-hooks/purity -- relative time display, intentionally uses current time
  const now = Date.now();
  const relative = (iso: string) => {
    const diff = now - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d < 7
      ? `${d}d ago`
      : new Date(iso).toLocaleDateString("en-US", {
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
            Chats
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            onClick={onClose}
            aria-label="Close history"
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
            New chat
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
              No conversations yet.
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
                    {c.title ?? "New chat"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {relative(c.lastMessageAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:!text-rose-500"
                  aria-label="Delete conversation"
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
  open: boolean;
  onClose: () => void;
  /** Candidate currently visible in the dashboard. */
  candidateId?: string;
  surfaceContext?: {
    kind: "candidate" | "section";
    label: string;
    path: string;
  };
};

function freshId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function HarlyAIPanel({
  userName,
  persistenceKey,
  aiEnabled,
  open,
  onClose,
  candidateId,
  surfaceContext,
}: HarlyAIPanelProps) {
  const [conversationId, setConversationId] = useState<string>(() => freshId());
  const [initialMessages, setInitialMessages] = useState<StoredUIMessage[]>([]);
  const [restoredPersistenceKey, setRestoredPersistenceKey] = useState<
    string | null
  >(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [historyOpen, setHistoryOpen] = useState(false);

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

    void loadConversationAction(storedId).then((messages) => {
      if (cancelled) return;
      if (messages) {
        setConversationId(storedId);
        setInitialMessages(messages);
      }
      setRestoredPersistenceKey(persistenceKey);
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
    await deleteConversationAction(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === conversationId) startNewChat();
  }

  return (
    <div
      className={cn(
        "fixed bottom-20 left-3 right-3 z-50 w-auto text-sm leading-6 transition-all duration-200 ease-out sm:left-auto sm:right-6 sm:w-[440px]",
        open
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "invisible translate-y-3 opacity-0 pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <Card
        className="relative flex h-[min(560px,calc(100dvh-7.5rem))] flex-col overflow-hidden border border-border/50 p-0 shadow-[0_1px_2px_rgba(23,23,23,0.04),0_4px_16px_rgba(23,23,23,0.03)] sm:h-[560px]"
        aria-label="Harly AI assistant"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-3">
          <div className="flex items-center gap-1.5">
            {aiEnabled && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={() => setHistoryOpen(true)}
                aria-label="Chat history"
              >
                <PanelLeft className="size-4" />
              </Button>
            )}
            <HarlyAILogoMark className="size-5 shrink-0" />
            <span className="text-sm font-semibold tracking-tight">
              Harly AI
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            {aiEnabled && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={startNewChat}
                aria-label="New chat"
              >
                <Plus className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={onClose}
              aria-label="Close Harly AI"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {!aiEnabled ? (
          <div className="flex flex-1 items-center justify-center">
            <NotConfiguredState />
          </div>
        ) : (
          <>
            {restoringConversation ? (
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                Restoring your chat…
              </div>
            ) : (
              <HarlyChat
                key={conversationId}
                conversationId={conversationId}
                initialMessages={initialMessages}
                userName={userName}
                candidateId={candidateId}
                surfaceContext={surfaceContext}
                onConversationActivity={refreshList}
              />
            )}
            <HistoryDrawer
              open={historyOpen}
              conversations={conversations}
              activeId={conversationId}
              onSelect={openConversation}
              onNew={startNewChat}
              onDelete={removeConversation}
              onClose={() => setHistoryOpen(false)}
            />
          </>
        )}
      </Card>
    </div>
  );
}

// The floating action button that used to live here is gone. A permanent FAB is
// a second brand identity shouting over the work; AI now opens from the top
// bar's chartreuse signal button and from the command menu (DESIGN.md).
