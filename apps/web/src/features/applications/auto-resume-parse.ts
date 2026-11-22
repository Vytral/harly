import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { candidateFiles, candidates, db } from "@harly/db";

import {
  hasParsedResumeDetails,
  parseCandidateFileDetails,
} from "@/features/candidates/resume-details";
import { createLogger } from "@/lib/logger";

const log = createLogger("application-resume-parse");

/**
 * Parse the resumes stored with a public application (career page or public
 * REST intake) the same way a dashboard upload is parsed: the AI structured
 * parse when the workspace has AI configured, the heuristic parse otherwise.
 * Runs after the response is sent; failures are logged and never surface to
 * the candidate.
 */
export async function scheduleApplicationResumeParse(
  candidateId: string,
  workspaceId: string,
): Promise<void> {
  try {
    const [candidate] = await db
      .select({ firstName: candidates.firstName, lastName: candidates.lastName })
      .from(candidates)
      .where(
        and(eq(candidates.id, candidateId), eq(candidates.workspaceId, workspaceId)),
      )
      .limit(1);
    if (!candidate) return;

    const files = await db
      .select({
        id: candidateFiles.id,
        fileName: candidateFiles.fileName,
        fileUrl: candidateFiles.fileUrl,
        fileType: candidateFiles.fileType,
        fileSize: candidateFiles.fileSize,
      })
      .from(candidateFiles)
      .where(
        and(
          eq(candidateFiles.workspaceId, workspaceId),
          eq(candidateFiles.candidateId, candidateId),
          isNull(candidateFiles.parsedAt),
          isNull(candidateFiles.uploadedById),
        ),
      );

    for (const file of files) {
      const details = await parseCandidateFileDetails({
        workspaceId,
        fileUrl: file.fileUrl,
        fileName: file.fileName,
        fileType: file.fileType ?? "",
        fileSize: file.fileSize ?? 0,
        identity: { firstName: candidate.firstName, lastName: candidate.lastName },
      });
      if (!hasParsedResumeDetails(details)) continue;

      await db
        .update(candidateFiles)
        .set({
          parsedSummary: details.summary,
          parsedSkills: details.skills,
          parsedEducation: details.education,
          parsedExperienceYears: details.experienceYears,
          parsedExperience: details.experience,
          parsedEducationItems: details.educationItems,
          parsedAt: new Date(),
        })
        .where(
          and(
            eq(candidateFiles.id, file.id),
            eq(candidateFiles.workspaceId, workspaceId),
            isNull(candidateFiles.parsedAt),
          ),
        );
    }
  } catch (error) {
    log.error(
      { err: error, candidateId, workspaceId },
      "application resume parse failed; application was saved",
    );
  }
}
