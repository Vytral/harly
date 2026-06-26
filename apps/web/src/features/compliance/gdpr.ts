import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@harly/db";
import {
  activityEvents,
  applicationAnswers,
  applications,
  candidates,
  candidateFiles,
  candidateMessages,
  candidateNotes,
  candidateTags,
  consentRecords,
  jobs,
  poolEntries,
  scorecards,
  candidatePortalSessions,
  aiEvaluations,
} from "@harly/db";

/**
 * DSAR Export (Art. 15 GDPR) — aggregates ALL personal data for a candidate
 * across every table into a single JSON-serializable object.
 *
 * Returns the data as a JSON string ready for download.
 */
export async function exportCandidateData(input: {
  candidateId: string;
  workspaceId: string;
}): Promise<{ ok: true; data: string; fileName: string } | { ok: false; message: string }> {
  const { candidateId, workspaceId } = input;

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!candidate) {
    return { ok: false, message: "Candidate not found." };
  }

  // Gather all related data in parallel
  const [
    applicationsData,
    notesData,
    filesData,
    messagesData,
    tagsData,
    consentsData,
    scorecardsData,
    poolData,
    activityData,
    aiEvalsData,
    portalSessionsData,
  ] = await Promise.all([
    // Applications + answers + stage history
    db
      .select({
        id: applications.id,
        jobId: applications.jobId,
        status: applications.status,
        source: applications.source,
        appliedAt: applications.appliedAt,
        createdAt: applications.createdAt,
      })
      .from(applications)
      .where(eq(applications.candidateId, candidateId))
      .orderBy(desc(applications.appliedAt)),

    // Application answers (via applicationId → applications)
    db
      .select({
        id: applicationAnswers.id,
        applicationId: applicationAnswers.applicationId,
        questionId: applicationAnswers.questionId,
        answer: applicationAnswers.answer,
        createdAt: applicationAnswers.createdAt,
      })
      .from(applicationAnswers)
      .innerJoin(applications, eq(applications.id, applicationAnswers.applicationId))
      .where(eq(applications.candidateId, candidateId)),

    // Files
    db
      .select()
      .from(candidateFiles)
      .where(eq(candidateFiles.candidateId, candidateId)),

    // Messages / email communications
    db
      .select()
      .from(candidateMessages)
      .where(eq(candidateMessages.candidateId, candidateId))
      .orderBy(desc(candidateMessages.createdAt)),

    // Tags
    db
      .select()
      .from(candidateTags)
      .where(eq(candidateTags.candidateId, candidateId)),

    // Consent records
    db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.candidateId, candidateId))
      .orderBy(desc(consentRecords.createdAt)),

    // Scorecards
    db
      .select()
      .from(scorecards)
      .where(eq(scorecards.candidateId, candidateId)),

    // Talent pool entries
    db
      .select()
      .from(poolEntries)
      .where(eq(poolEntries.candidateId, candidateId)),

    // Activity events
    db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.entityType, "candidate"),
          eq(activityEvents.entityId, candidateId),
        ),
      )
      .orderBy(desc(activityEvents.createdAt)),

    // AI evaluations
    db
      .select()
      .from(aiEvaluations)
      .where(eq(aiEvaluations.candidateId, candidateId)),

    // Portal sessions (hashed tokens — include for transparency)
    db
      .select({
        id: candidatePortalSessions.id,
        userAgent: candidatePortalSessions.userAgent,
        expiresAt: candidatePortalSessions.expiresAt,
        createdAt: candidatePortalSessions.createdAt,
      })
      .from(candidatePortalSessions)
      .where(eq(candidatePortalSessions.candidateId, candidateId)),
  ]);

  // Resolve job titles for applications
  const jobIds = [...new Set(applicationsData.map((a) => a.jobId))];
  const jobsData =
    jobIds.length > 0
      ? await db
          .select({ id: jobs.id, title: jobs.title })
          .from(jobs)
          .where(sql`${jobs.id} = ANY(${jobIds})`)
      : [];
  const jobTitleMap = new Map(jobsData.map((j) => [j.id, j.title]));

  // Build the export bundle
  const exportData = {
    exportedAt: new Date().toISOString(),
    candidate: {
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      location: candidate.location,
      linkedinUrl: candidate.linkedinUrl,
      githubUrl: candidate.githubUrl,
      websiteUrl: candidate.websiteUrl,
      headline: candidate.headline,
      skills: candidate.skills,
      experienceYears: candidate.experienceYears,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    },
    applications: applicationsData.map((a) => ({
      ...a,
      jobTitle: jobTitleMap.get(a.jobId) ?? null,
    })),
    applicationAnswers: notesData,
    notes: notesData,
    files: filesData.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      fileType: f.fileType,
      fileSize: f.fileSize,
      fileUrl: f.fileUrl,
      createdAt: f.createdAt,
    })),
    messages: messagesData,
    tags: tagsData,
    consentRecords: consentsData,
    scorecards: scorecardsData,
    talentPoolEntries: poolData,
    activityEvents: activityData,
    aiEvaluations: aiEvalsData,
    portalSessions: portalSessionsData,
  };

  const fileName = `dsar-export-${candidate.email}-${candidate.id}.json`;

  return {
    ok: true,
    data: JSON.stringify(exportData, null, 2),
    fileName,
  };
}
