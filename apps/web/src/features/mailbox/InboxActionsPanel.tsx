"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import {
  Archive,
  Bot,
  FileText,
  ShieldAlert,
  Sparkles,
  UserPlus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { InboxApplication, InboxCandidate, InboxMember, InboxThread } from "@/features/mailbox/data";

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
  onSummarize: () => Promise<{ ok: boolean; summary?: AiSummary; error?: string }>;
  onSuggestReply: () => Promise<{ ok: boolean; draft?: { body: string }; error?: string }>;
}) {
  const idPrefix = useId();
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPending, startAiTransition] = useTransition();
  const candidateApplications = thread.candidateId
    ? applications.filter((application) => application.candidateId === thread.candidateId)
    : [];

  function runAi(action: () => Promise<{ ok: boolean; summary?: AiSummary; draft?: { body: string }; error?: string }>, onSuccess?: (result: { summary?: AiSummary; draft?: { body: string } }) => void) {
    setAiError(null);
    startAiTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) setAiError(result.error ?? "AI action failed.");
        else onSuccess?.(result);
      } catch {
        setAiError("You do not have permission to use this AI action.");
      }
    });
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-sm font-medium">Thread context</p>
        <p className="mt-1 text-xs text-muted-foreground">Keep ownership and recruiting context current.</p>
      </div>

      <div className="space-y-3">
        <label className="block space-y-1.5 text-xs font-medium" htmlFor={`${idPrefix}-owner`}>
          Owner
          <Select value={thread.ownerId ?? "unassigned"} onValueChange={(value) => void onAssign(value === "unassigned" ? null : value)}>
            <SelectTrigger id={`${idPrefix}-owner`} className="w-full" size="sm"><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>

        <label className="block space-y-1.5 text-xs font-medium" htmlFor={`${idPrefix}-candidate`}>
          Candidate
          <Select value={thread.candidateId ?? "none"} onValueChange={(value) => void onCandidateChange(value === "none" ? null : value)}>
            <SelectTrigger id={`${idPrefix}-candidate`} className="w-full" size="sm"><SelectValue placeholder="No candidate linked" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No candidate linked</SelectItem>
              {candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>

        <label className="block space-y-1.5 text-xs font-medium" htmlFor={`${idPrefix}-application`}>
          Application / job
          <Select value={thread.applicationId ?? "none"} disabled={!thread.candidateId} onValueChange={(value) => void onApplicationChange(value === "none" ? null : value)}>
            <SelectTrigger id={`${idPrefix}-application`} className="w-full" size="sm"><SelectValue placeholder={thread.candidateId ? "No application linked" : "Link a candidate first"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No application linked</SelectItem>
              {candidateApplications.map((application) => <SelectItem key={application.id} value={application.id}>{application.jobTitle}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="space-y-2 border-t border-border/80 pt-4">
        <div className="flex items-center gap-2">
          <Badge variant={thread.status === "open" ? "secondary" : "neutral"}>{thread.status}</Badge>
          {thread.ownerName ? <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><UserAvatar name={thread.ownerName} src={thread.ownerImage} size="sm" />{thread.ownerName}</span> : <span className="text-xs text-muted-foreground">No owner</span>}
        </div>
        {thread.candidateId && thread.candidateName ? <Link href={`/dashboard/candidates/${thread.candidateId!}`} className="block truncate text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">View candidate profile · {thread.candidateName}</Link> : null}
        {thread.jobId && thread.jobTitle ? <div className="flex items-center gap-2"><Link href={`/dashboard/jobs/${thread.jobId}`} className="block min-w-0 truncate text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">View job · {thread.jobTitle}</Link>{thread.applicationStatus ? <Badge variant="neutral">{thread.applicationStatus}</Badge> : null}</div> : null}
      </div>

      {!thread.candidateName ? <Button className="w-full justify-start" variant="outline" disabled={isPending || thread.source !== "mailbox"} onClick={onCreateCandidate}><UserPlus className="size-4" /> Create candidate from sender</Button> : null}

      <div className="border-t border-border/80 pt-4">
        <div className="mb-2 flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">AI assistance</p><Badge variant="neutral">Review required</Badge></div>
        <Button className="mb-1 w-full justify-start" size="sm" variant="outline" disabled={aiPending} onClick={() => runAi(onSummarize, (result) => setAiSummary(result.summary ?? null))}><Sparkles className="size-4" /> {aiPending ? "Working…" : "Summarize conversation"}</Button>
        {thread.transport === "imap" ? <Button className="mb-1 w-full justify-start" size="sm" variant="outline" disabled={aiPending} onClick={() => runAi(onSuggestReply, () => undefined)}><Bot className="size-4" /> Suggest reply</Button> : null}
        {aiError ? <p role="alert" className="mt-2 text-xs text-destructive">{aiError}</p> : null}
        {aiSummary ? <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3 text-xs"><p><span className="font-medium">Summary:</span> {aiSummary.summary}</p><p><span className="font-medium">Latest intent:</span> {aiSummary.lastIntent}</p><p><span className="font-medium">Next step:</span> {aiSummary.nextStep}</p>{aiSummary.openQuestions.length ? <div><p className="font-medium">Open questions:</p><ul className="mt-1 list-disc space-y-1 pl-4">{aiSummary.openQuestions.map((question) => <li key={question}>{question}</li>)}</ul></div> : null}</div> : null}
        <div className="mt-2 space-y-1">
          {[[Bot, "Classify"], [UserPlus, "Extract candidate"], [FileText, "Analyze CV"]].map(([Icon, label]) => <Tooltip key={label as string}><TooltipTrigger asChild><span className="block"><Button className="w-full justify-start text-muted-foreground" size="sm" variant="ghost" disabled aria-describedby={`${idPrefix}-future-${label}`}><Icon className="size-4" /> {label as string}</Button></span></TooltipTrigger><TooltipContent id={`${idPrefix}-future-${label}`}>Future flow. This action is not available yet.</TooltipContent></Tooltip>)}
        </div>
      </div>

      {thread.source === "mailbox" ? <div className="border-t border-border/80 pt-4"><Button className="mb-1 w-full justify-start" size="sm" variant="ghost" disabled={isPending} onClick={onArchive}><Archive className="size-4" /> Archive</Button><Button className="w-full justify-start text-destructive hover:text-destructive" size="sm" variant="ghost" disabled={isPending} onClick={onMarkSpam}><ShieldAlert className="size-4" /> Mark spam</Button></div> : null}
    </div>
  );
}
