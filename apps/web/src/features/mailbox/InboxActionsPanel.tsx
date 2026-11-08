"use client";

import { useAiEnabled } from "@/components/ai/AiAvailability";
import { useId, useState, useTransition } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  EnvelopeSimpleDuotoneIcon,
  ProhibitIcon,
  RobotDuotoneIcon,
  SparkleFillIcon,
  TrayIcon,
  UserPlusIcon,
} from "@/components/ui/icons/phosphor";
import type { InboxApplication, InboxCandidate, InboxMember, InboxThread } from "@/features/mailbox/data";
import { ThreadChips } from "@/features/mailbox/InboxThreadMeta";
import { threadPersonName } from "@/features/mailbox/inbox-filters";

type AiSummary = { summary: string; lastIntent: string; nextStep: string; openQuestions: string[] };

export function InboxActionsPanel({
  thread,
  members,
  candidates,
  applications,
  isPending,
  onAssign,
  onCandidateChange,
  onApplicationChange,
  onCreateCandidate,
  onArchive,
  onMarkSpam,
  onNewEmail,
  onSummarize,
  onSuggestReply,
}: {
  thread: InboxThread;
  members: InboxMember[];
  candidates: InboxCandidate[];
  applications: InboxApplication[];
  isPending: boolean;
  onAssign: (ownerId: string | null) => Promise<{ ok: boolean; error?: string }>;
  onCandidateChange: (candidateId: string | null) => Promise<{ ok: boolean; error?: string }>;
  onApplicationChange: (applicationId: string | null) => Promise<{ ok: boolean; error?: string }>;
  onCreateCandidate: () => void;
  onArchive: () => void;
  onMarkSpam: () => void;
  /** Starts a new thread to this person (only when they have an address). */
  onNewEmail?: () => void;
  onSummarize: () => Promise<{ ok: boolean; summary?: AiSummary; error?: string }>;
  onSuggestReply: () => Promise<{ ok: boolean; draft?: { body: string }; error?: string }>;
}) {
  const aiEnabled = useAiEnabled();
  const idPrefix = useId();
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPending, startAiTransition] = useTransition();
  const candidateApplications = thread.candidateId
    ? applications.filter((application) => application.candidateId === thread.candidateId)
    : [];

  function runAi(
    action: () => Promise<{ ok: boolean; summary?: AiSummary; draft?: { body: string }; error?: string }>,
    onSuccess?: (result: { summary?: AiSummary; draft?: { body: string } }) => void,
  ) {
    setAiError(null);
    startAiTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) setAiError(result.error ?? "AI action failed.");
        else onSuccess?.(result);
      } catch {
        setAiError("We could not complete that AI action.");
      }
    });
  }

  const name = threadPersonName(thread);
  const archived = thread.status === "archived";
  const sectionTitle = "text-[11px] font-semibold uppercase tracking-[0.09em] text-soft-ink";

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain" aria-label="Conversation context">
      <div className="space-y-5 px-4 py-5">
        <section className="rounded-[var(--radius-card)] bg-pure-snow p-4 shadow-[var(--shadow-card)] dark:bg-card">
          <div className="flex items-start gap-3">
            <UserAvatar name={name} src={thread.candidateAvatarUrl} size="lg" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{thread.candidateName ?? "Unknown sender"}</p>
              <p className="mt-0.5 truncate text-xs text-soft-ink">{thread.participantEmail ?? "No reply address"}</p>
            </div>
          </div>
          {thread.jobTitle || thread.applicationId ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <ThreadChips thread={thread} size="md" />
            </div>
          ) : null}
          <div className="mt-4 grid gap-1.5">
            {thread.candidateId && thread.candidateName ? (
              <Button asChild size="sm" variant="outline" className="justify-start">
                <Link href={`/dashboard/candidates/${thread.candidateId}`}>
                  <UserPlusIcon className="size-4" />
                  Open profile
                </Link>
              </Button>
            ) : (
              <Button className="justify-start" variant="outline" size="sm" disabled={isPending || thread.source !== "mailbox"} onClick={onCreateCandidate}>
                <UserPlusIcon className="size-4" />
                Create candidate from sender
              </Button>
            )}
            {thread.jobId ? (
              <Button asChild size="sm" variant="ghost" className="justify-start">
                <Link href={`/dashboard/pipeline?jobId=${thread.jobId}`}>View in pipeline</Link>
              </Button>
            ) : null}
            {onNewEmail ? (
              <Button size="sm" variant="ghost" className="justify-start" onClick={onNewEmail}>
                <EnvelopeSimpleDuotoneIcon className="size-4" />
                New email to {name.split(" ")[0]}
              </Button>
            ) : null}
          </div>
          {thread.candidateId ? <p className="mt-3 text-[11px] leading-4 text-quiet-mist">Move stage, schedule and evaluate from the candidate profile.</p> : null}
        </section>

        <section className="space-y-4" aria-labelledby={`${idPrefix}-context-heading`}>
          <h3 id={`${idPrefix}-context-heading`} className={sectionTitle}>Routing</h3>

          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-owner`} className="text-[13px] font-medium text-foreground">Owner</label>
            <Select value={thread.ownerId ?? "unassigned"} disabled={isPending} onValueChange={(value) => void onAssign(value === "unassigned" ? null : value)}>
              <SelectTrigger id={`${idPrefix}-owner`} className="w-full bg-background" size="sm"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-candidate`} className="text-[13px] font-medium text-foreground">Candidate</label>
            <Select value={thread.candidateId ?? "none"} disabled={isPending} onValueChange={(value) => void onCandidateChange(value === "none" ? null : value)}>
              <SelectTrigger id={`${idPrefix}-candidate`} className="w-full bg-background" size="sm"><SelectValue placeholder="No candidate linked" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No candidate linked</SelectItem>
                {candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-application`} className="text-[13px] font-medium text-foreground">Application</label>
            <Select value={thread.applicationId ?? "none"} disabled={!thread.candidateId || isPending} onValueChange={(value) => void onApplicationChange(value === "none" ? null : value)}>
              <SelectTrigger id={`${idPrefix}-application`} className="w-full bg-background" size="sm"><SelectValue placeholder={thread.candidateId ? "No application linked" : "Link a candidate first"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No application linked</SelectItem>
                {candidateApplications.map((application) => <SelectItem key={application.id} value={application.id}>{application.jobTitle}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </section>

        {aiEnabled ? (
        <section className="border-t border-hairline pt-4" aria-labelledby={`${idPrefix}-ai-heading`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 id={`${idPrefix}-ai-heading`} className={sectionTitle}>Harly AI</h3>
            <span className="text-[11px] text-quiet-mist">Review before using</span>
          </div>
          <div className="space-y-2">
            <Button className="w-full justify-start" size="sm" variant="outline" disabled={aiPending} onClick={() => runAi(onSummarize, (result) => setAiSummary(result.summary ?? null))}>
              <SparkleFillIcon className="size-4 text-success-olive" />
              {aiPending ? "Working…" : "Summarize conversation"}
            </Button>
            {thread.transport === "imap" ? (
              <Button className="w-full justify-start" size="sm" variant="outline" disabled={aiPending} onClick={() => runAi(onSuggestReply)}>
                <RobotDuotoneIcon className="size-4" />
                Suggest a reply
              </Button>
            ) : null}
          </div>
          {aiError ? <p role="alert" className="mt-2 text-xs leading-5 text-destructive">{aiError}</p> : null}
          {aiSummary ? (
            <div className="mt-3 space-y-2 rounded-[var(--radius-inner)] bg-lime-wash p-3 text-xs leading-5 duration-200 animate-in fade-in-0 motion-reduce:animate-none">
              <p><span className="font-semibold">Summary:</span> {aiSummary.summary}</p>
              <p><span className="font-semibold">Latest intent:</span> {aiSummary.lastIntent}</p>
              <p><span className="font-semibold">Next step:</span> {aiSummary.nextStep}</p>
              {aiSummary.openQuestions.length ? <div><p className="font-semibold">Open questions:</p><ul className="mt-1 list-disc space-y-1 pl-4">{aiSummary.openQuestions.map((question) => <li key={question}>{question}</li>)}</ul></div> : null}
            </div>
          ) : null}
        </section>
        ) : null}

        {thread.source === "mailbox" ? (
          <section className="border-t border-hairline pt-4">
            <h3 className={sectionTitle}>Thread actions</h3>
            <div className="mt-2 space-y-1">
              <Button className="w-full justify-start" size="sm" variant="ghost" disabled={isPending} onClick={onArchive}>
                <TrayIcon className="size-4" /> {archived ? "Move back to inbox" : "Archive thread"}
              </Button>
              {thread.status !== "spam" ? (
                <Button className="w-full justify-start text-destructive hover:text-destructive" size="sm" variant="ghost" disabled={isPending} onClick={onMarkSpam}><ProhibitIcon className="size-4" /> Mark as spam</Button>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
