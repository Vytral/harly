"use client";

import { useState } from "react";
import {
  CalendarClock,
  ClipboardCheck,
  Mail,
  MessageSquare,
  Plus,
} from "lucide-react";

import { AiScoreCard } from "@/features/candidates/AiScoreCard";
import { CandidateDetailsPanel } from "@/features/candidates/CandidateDetailsPanel";
import { EmailDrawer } from "@/features/candidates/EmailDrawer";
import { EvaluationDrawer } from "@/features/candidates/EvaluationDrawer";
import { NoteForm } from "@/features/candidates/NoteForm";
import { ScheduleDrawer } from "@/features/candidates/ScheduleDrawer";
import { OffersPanel } from "@/features/offers/OffersPanel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ActivityTimeline } from "./candidate-profile/ActivityTimeline";
import { ConversationThread } from "./candidate-profile/ConversationThread";
import { DocumentsSection } from "./candidate-profile/DocumentsSection";
import { InterviewCard } from "./candidate-profile/InterviewCard";
import { PrivacyRequestCard } from "./candidate-profile/PrivacyRequestCard";
import { ScorecardList } from "./candidate-profile/ScorecardList";
import { CandidateSignaturePanel } from "./candidate-profile/SignaturePanel";
import { EmptySection, SectionHeading, TabCount } from "./candidate-profile/shared";
import type {
  CandidateMessage,
  CandidateProfileTabsProps,
} from "./candidate-profile/types";

/** Groups a flat message list into threads, oldest message first inside each. */
function groupIntoConversations(messages: CandidateMessage[]) {
  const threads = messages.reduce((groups, message) => {
    const key = message.threadId ?? `legacy:${message.id}`;
    const group = groups.get(key) ?? [];
    group.push(message);
    groups.set(key, group);
    return groups;
  }, new Map<string, CandidateMessage[]>());

  return Array.from(threads.values()).map((group) =>
    group.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
}

export function CandidateProfileTabs({
  candidateId,
  workspaceId,
  candidateEmail,
  candidateName,
  candidatePhone,
  candidateAddress,
  candidateLinkedinUrl,
  candidateGithubUrl,
  candidateWebsiteUrl,
  candidateSummary,
  candidateEducationEntries,
  candidateExperienceEntries,
  stageName,
  applications,
  notes,
  files,
  relatedDocuments,
  signableDocuments,
  documentRequests,
  canManageDocuments,
  activity,
  scorecards,
  messages,
  interviews,
  members,
  aiEvaluations,
  aiConfigured,
  offers,
  emailTemplates = [],
  emailTemplateValues = {},
  scheduleApplications,
  scheduleMembers,
  scheduleCal,
  currentUserId,
  privacyRequests = [],
  canFulfilErasure = false,
}: CandidateProfileTabsProps) {
  const [tab, setTab] = useState("overview");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const conversations = groupIntoConversations(messages);
  const jobOptions = applications.map((application) => ({
    id: application.id,
    jobTitle: application.jobTitle,
  }));

  return (
    <Tabs value={tab} onValueChange={setTab}>
      {/*
        Three sections, hard cap (DESIGN.md , Candidate Focus).

        This was eight equal tabs: Profile, Interviews, Communication,
        Evaluation, Offers, Activity, Documents, Privacy. Eight equal tabs is a
        confession that the model was never decided , everything is equally
        important, so nothing is. A recruiter does not work by tab, they work by
        intention: is this person any good (Overview), what is happening with
        them (Process), and what is on file (Files).

        Radix renders every TabsContent whose value matches, so each former
        panel lives on as a labelled section inside its new home.
      */}
      <TabsList
        variant="line"
        className="w-full justify-start gap-5 border-b border-hairline text-sm [&>button]:flex-none [&>button]:px-0.5"
      >
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="process">
          Process
          <TabCount
            value={
              interviews.length +
              messages.length +
              scorecards.length +
              offers.length
            }
          />
        </TabsTrigger>
        <TabsTrigger value="files">
          Files
          <TabCount value={relatedDocuments.length + privacyRequests.length} />
        </TabsTrigger>
      </TabsList>

      {/* ── Overview , AI match leads, single "Details" panel follows ── */}
      <TabsContent value="overview" className="mt-5 space-y-4">
        <AiScoreCard
          applications={jobOptions}
          evaluations={aiEvaluations}
          aiConfigured={aiConfigured}
          variant="condensed"
          onViewDetailsAction={() => setTab("process")}
        />

        <CandidateDetailsPanel
          candidateId={candidateId}
          workspaceId={workspaceId}
          files={files}
          applications={applications}
          email={candidateEmail}
          phone={candidatePhone}
          address={candidateAddress}
          linkedinUrl={candidateLinkedinUrl}
          githubUrl={candidateGithubUrl}
          websiteUrl={candidateWebsiteUrl}
          summary={candidateSummary}
          educationEntries={candidateEducationEntries}
          experienceEntries={candidateExperienceEntries}
        />
      </TabsContent>

      {/* ── Overview , activity and notes ── */}
      <TabsContent value="overview" className="mt-4 space-y-4">
        <SectionHeading>Activity &amp; notes</SectionHeading>

        {/* Notes always on top so the form is reachable without scrolling */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes &amp; comments
          </p>
          <NoteForm
            candidateId={candidateId}
            workspaceId={workspaceId}
            initialNotes={notes}
            members={members}
          />
        </div>

        {activity.length > 0 ? (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Timeline
            </p>
            <ActivityTimeline activity={activity} />
          </div>
        ) : null}

        {activity.length === 0 && notes.length === 0 ? (
          <EmptySection
            icon={MessageSquare}
            title="Nothing has happened yet"
            hint="Stage moves, notes, emails and interviews all land here in order, so you can see how this candidate got to where they are."
          />
        ) : null}
      </TabsContent>

      {/* ── Process , interviews ── */}
      <TabsContent value="process" className="mt-4 space-y-3">
        <SectionHeading>Interviews</SectionHeading>
        <div className="flex justify-end">
          <ScheduleDrawer
            candidateId={candidateId}
            workspaceId={workspaceId}
            candidateName={candidateName}
            candidateEmail={candidateEmail}
            applications={scheduleApplications}
            members={scheduleMembers}
            cal={scheduleCal}
            trigger={
              <Button size="sm">
                <Plus className="size-4" />
                Schedule interview
              </Button>
            }
          />
        </div>
        {interviews.length === 0 ? (
          <EmptySection
            icon={CalendarClock}
            title="No interviews yet"
            hint="Schedule one with the button above. The join link, the interviewer and the notes all stay on the card."
          />
        ) : (
          <div className="space-y-3 duration-300 animate-in fade-in slide-in-from-bottom-1">
            {interviews.map((interview) => (
              <InterviewCard
                key={interview.id}
                interview={interview}
                candidateId={candidateId}
                workspaceId={workspaceId}
                members={scheduleMembers}
                currentUserId={currentUserId}
                aiConfigured={aiConfigured}
              />
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── Process , communication ── */}
      <TabsContent value="process" className="mt-4 space-y-3">
        <SectionHeading>Communication</SectionHeading>
        <div className="flex justify-end">
          <EmailDrawer
            candidateId={candidateId}
            workspaceId={workspaceId}
            email={candidateEmail}
            name={candidateName}
            templates={emailTemplates}
            templateValues={emailTemplateValues}
            aiConfigured={aiConfigured}
            trigger={
              <Button size="sm">
                <Mail className="size-4" />
                New message
              </Button>
            }
          />
        </div>
        {messages.length === 0 ? (
          <EmptySection
            icon={Mail}
            title={`You haven't emailed ${candidateName.split(" ")[0]} yet`}
            hint="Write the first message above. Their replies arrive in the Inbox and thread back here automatically."
          />
        ) : (
          <div className="space-y-4 duration-300 animate-in fade-in slide-in-from-bottom-1">
            {conversations.map((conversation) => (
              <ConversationThread
                key={conversation[0]!.threadId ?? `legacy:${conversation[0]!.id}`}
                conversation={conversation}
                candidateId={candidateId}
                candidateName={candidateName}
                candidateEmail={candidateEmail}
                workspaceId={workspaceId}
                aiConfigured={aiConfigured}
              />
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── Process , evaluation: AI score + scorecards ── */}
      <TabsContent value="process" className="mt-4 space-y-4">
        <SectionHeading>Evaluation</SectionHeading>
        <AiScoreCard
          applications={jobOptions}
          evaluations={aiEvaluations}
          aiConfigured={aiConfigured}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {scorecards.length === 0
              ? "Nobody on the team has scored this candidate yet."
              : `${scorecards.length} evaluation${scorecards.length === 1 ? "" : "s"} from the team.`}
          </p>
          {applications[0] ? (
            <EvaluationDrawer
              candidateId={candidateId}
              workspaceId={workspaceId}
              applicationId={applications[0].id}
              stageName={stageName}
              trigger={
                <Button size="sm">
                  <ClipboardCheck className="size-4" />
                  Add evaluation
                </Button>
              }
            />
          ) : (
            <Button size="sm" disabled title="This candidate has no application to score">
              <ClipboardCheck className="size-4" />
              Add evaluation
            </Button>
          )}
        </div>
        <ScorecardList scorecards={scorecards} />
      </TabsContent>

      {/* ── Process , offers ── */}
      <TabsContent value="process" className="mt-4">
        <SectionHeading>Offers</SectionHeading>
        <OffersPanel
          offers={offers}
          applications={jobOptions}
          documents={relatedDocuments}
        />
      </TabsContent>

      {/* ── Files , documents ── */}
      <TabsContent value="files" className="mt-4 space-y-4">
        <SectionHeading>Documents</SectionHeading>
        <DocumentsSection
          candidateId={candidateId}
          relatedDocuments={relatedDocuments}
          documentRequests={documentRequests}
          applications={jobOptions}
          canManageDocuments={canManageDocuments}
          hasSignableDocuments={signableDocuments.length > 0}
          onRequestSignature={() => setSignatureOpen(true)}
        />
        <CandidateSignaturePanel
          open={signatureOpen}
          onOpenChange={setSignatureOpen}
          candidateName={candidateName}
          candidateEmail={candidateEmail}
          documents={signableDocuments}
        />
      </TabsContent>

      {/*
        Files , privacy requests. Rendered only when one exists: a permanently
        visible "Privacy requests / none" block is a section explaining that it
        has nothing to say, which is the same mistake the AI panels made.
      */}
      {privacyRequests.length > 0 ? (
        <TabsContent value="files" className="mt-4 space-y-3">
          <SectionHeading>Privacy requests</SectionHeading>
          <div className="space-y-4 duration-300 animate-in fade-in slide-in-from-bottom-1">
            {privacyRequests.map((request) => (
              <PrivacyRequestCard
                key={request.id}
                request={request}
                candidateId={candidateId}
                candidateEmail={candidateEmail}
                canFulfilErasure={canFulfilErasure}
                inventory={{
                  applications: applications.length,
                  interviews: interviews.length,
                  messages: messages.length,
                  files: files.length,
                  notes: notes.length,
                  scorecards: scorecards.length,
                  aiEvaluations: aiEvaluations.length,
                  offers: offers.length,
                  activity: activity.length,
                }}
              />
            ))}
          </div>
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
