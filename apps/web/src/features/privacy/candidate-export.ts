import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  aiEvaluations,
  applicationAnswers,
  applicationQuestions,
  applications,
  candidateFiles,
  candidateTags,
  candidates,
  consentRecords,
  db,
  dsarRequests,
  jobs,
  mailMessages,
} from "@harly/db";

export type CandidateExportFormat = "json" | "csv";

type JsonRecord = Record<string, unknown>;

function valueOrNull(value: unknown) {
  return value === undefined ? null : value;
}

/**
 * Builds a portable, machine-readable copy of data relating to one candidate.
 * This deliberately excludes internal notes and staff identifiers: those can
 * contain third-party personal data and are not needed for data portability.
 */
export async function buildCandidateDataExport(input: {
  candidateId: string;
  workspaceId: string;
}): Promise<JsonRecord | null> {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.id, input.candidateId),
        eq(candidates.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  if (!candidate) return null;

  const candidateApplications = await db
    .select({
      id: applications.id,
      jobTitle: jobs.title,
      status: applications.status,
      source: applications.source,
      coverLetter: applications.coverLetter,
      snapshot: applications.snapshot,
      appliedAt: applications.appliedAt,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(
      and(
        eq(applications.workspaceId, input.workspaceId),
        eq(applications.candidateId, input.candidateId),
      ),
    )
    .orderBy(desc(applications.appliedAt));

  const applicationIds = candidateApplications.map((application) => application.id);
  const answers = applicationIds.length
    ? await db
        .select({
          applicationId: applicationAnswers.applicationId,
          label: applicationQuestions.label,
          type: applicationQuestions.type,
          answer: applicationAnswers.answer,
        })
        .from(applicationAnswers)
        .innerJoin(
          applicationQuestions,
          eq(applicationQuestions.id, applicationAnswers.questionId),
        )
        .where(
          and(
            eq(applicationAnswers.workspaceId, input.workspaceId),
            inArray(applicationAnswers.applicationId, applicationIds),
          ),
        )
        .orderBy(applicationQuestions.order)
    : [];
  const answersByApplication = new Map<string, JsonRecord[]>();
  for (const answer of answers) {
    const list = answersByApplication.get(answer.applicationId) ?? [];
    list.push({ label: answer.label, type: answer.type, answer: answer.answer });
    answersByApplication.set(answer.applicationId, list);
  }

  const [files, tags, consents, evaluations, messages] = await Promise.all([
    db
      .select({
        fileName: candidateFiles.fileName,
        fileType: candidateFiles.fileType,
        fileSize: candidateFiles.fileSize,
        parsedSummary: candidateFiles.parsedSummary,
        parsedSkills: candidateFiles.parsedSkills,
        parsedEducation: candidateFiles.parsedEducation,
        parsedExperienceYears: candidateFiles.parsedExperienceYears,
        parsedExperience: candidateFiles.parsedExperience,
        parsedEducationItems: candidateFiles.parsedEducationItems,
        createdAt: candidateFiles.createdAt,
      })
      .from(candidateFiles)
      .where(
        and(
          eq(candidateFiles.workspaceId, input.workspaceId),
          eq(candidateFiles.candidateId, input.candidateId),
        ),
      )
      .orderBy(asc(candidateFiles.createdAt)),
    db
      .select({ label: candidateTags.label, createdAt: candidateTags.createdAt })
      .from(candidateTags)
      .where(
        and(
          eq(candidateTags.workspaceId, input.workspaceId),
          eq(candidateTags.candidateId, input.candidateId),
        ),
      )
      .orderBy(asc(candidateTags.label)),
    db
      .select({
        type: consentRecords.consentType,
        text: consentRecords.consentText,
        granted: consentRecords.granted,
        withdrawnAt: consentRecords.withdrawnAt,
        createdAt: consentRecords.createdAt,
      })
      .from(consentRecords)
      .where(
        and(
          eq(consentRecords.workspaceId, input.workspaceId),
          eq(consentRecords.candidateId, input.candidateId),
        ),
      )
      .orderBy(asc(consentRecords.createdAt)),
    db
      .select({
        applicationId: aiEvaluations.applicationId,
        provider: aiEvaluations.provider,
        modelId: aiEvaluations.modelId,
        score: aiEvaluations.score,
        recommendation: aiEvaluations.recommendation,
        summary: aiEvaluations.summary,
        strengths: aiEvaluations.strengths,
        gaps: aiEvaluations.gaps,
        criteria: aiEvaluations.criteria,
        usedResume: aiEvaluations.usedResume,
        createdAt: aiEvaluations.createdAt,
        updatedAt: aiEvaluations.updatedAt,
      })
      .from(aiEvaluations)
      .where(
        and(
          eq(aiEvaluations.workspaceId, input.workspaceId),
          eq(aiEvaluations.candidateId, input.candidateId),
        ),
      )
      .orderBy(desc(aiEvaluations.updatedAt)),
    db
      .select({
        direction: mailMessages.direction,
        fromEmail: mailMessages.fromEmail,
        toEmails: mailMessages.toEmails,
        subject: mailMessages.subject,
        textBody: mailMessages.textBody,
        receivedAt: mailMessages.receivedAt,
      })
      .from(mailMessages)
      .where(
        and(
          eq(mailMessages.workspaceId, input.workspaceId),
          eq(mailMessages.candidateId, input.candidateId),
        ),
      )
      .orderBy(asc(mailMessages.receivedAt)),
  ]);

  return {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    candidate: {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: valueOrNull(candidate.phone),
      address: valueOrNull(candidate.address),
      location: valueOrNull(candidate.location),
      linkedinUrl: valueOrNull(candidate.linkedinUrl),
      githubUrl: valueOrNull(candidate.githubUrl),
      websiteUrl: valueOrNull(candidate.websiteUrl),
      headline: valueOrNull(candidate.headline),
      summary: valueOrNull(candidate.summary),
      skills: candidate.skills,
      experienceYears: valueOrNull(candidate.experienceYears),
      educationEntries: candidate.educationEntries,
      experienceEntries: candidate.experienceEntries,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    },
    applications: candidateApplications.map((application) => ({
      ...application,
      answers: answersByApplication.get(application.id) ?? [],
    })),
    files,
    tags,
    consents,
    aiEvaluations: evaluations,
    messages,
  };
}

export function candidateExportCsv(exportData: JsonRecord): string {
  const candidate = exportData.candidate as JsonRecord;
  const applications = exportData.applications as JsonRecord[];
  const fields = [
    "firstName", "lastName", "email", "phone", "address", "location",
    "linkedinUrl", "githubUrl", "websiteUrl", "headline", "summary", "skills",
    "experienceYears", "educationEntries", "experienceEntries", "createdAt", "updatedAt",
  ];
  const header = ["recordType", "applicationJobTitle", ...fields];
  const rows = [header, ...applications.map((application) => [
    "candidate-application",
    application.jobTitle,
    ...fields.map((field) => candidate[field]),
  ])];
  if (applications.length === 0) {
    rows.push(["candidate", "", ...fields.map((field) => candidate[field])]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "string"
      ? value
      : value instanceof Date
        ? value.toISOString()
        : JSON.stringify(value);
  // Prevent spreadsheet formula execution when the portable CSV is opened.
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export async function recordCompletedCandidateExport(input: {
  candidateId: string;
  workspaceId: string;
  requestedBy: string;
}) {
  const now = new Date();
  await db.insert(dsarRequests).values({
    candidateId: input.candidateId,
    workspaceId: input.workspaceId,
    type: "export",
    status: "completed",
    requestedBy: input.requestedBy,
    processedBy: "candidate-self-service",
    notes: "Self-service authenticated data export.",
    completedAt: now,
    updatedAt: now,
  });
}
