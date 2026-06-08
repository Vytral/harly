"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import {
  createJob,
  permanentlyDeleteJob,
  restoreJob,
  trashJob,
  updateJob,
  updateJobStatus,
} from "./data";
import { jobFormSchema, jobStatusSchema } from "./validation";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { generateJobDraftWithAI } from "@/lib/ai/surfaces/generate-job";
import type { JobDraft } from "@/lib/ai/schemas";

function parseJobFormData(formData: FormData) {
  return jobFormSchema.parse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    department: formData.get("department"),
    location: formData.get("location"),
    employmentType: formData.get("employmentType"),
    workplaceType: formData.get("workplaceType"),
    experienceLevel: formData.get("experienceLevel"),
    education: formData.get("education"),
    keywordsJson: formData.get("keywordsJson"),
    description: formData.get("description"),
    contentSectionsJson: formData.get("contentSectionsJson"),
    salaryMin: formData.get("salaryMin"),
    salaryMax: formData.get("salaryMax"),
    currency: formData.get("currency"),
    salaryPeriod: formData.get("salaryPeriod"),
    officeAddress: formData.get("officeAddress"),
    officePhotosJson: formData.get("officePhotosJson"),
    resumeRequired: formData.get("resumeRequired"),
    profileLinkLinkedin: formData.get("profileLinkLinkedin"),
    profileLinkGithub: formData.get("profileLinkGithub"),
    profileLinkWebsite: formData.get("profileLinkWebsite"),
    applicationQuestionsJson: formData.get("applicationQuestionsJson"),
  });
}

export type JobActionState = {
  success: boolean;
  error?: string;
};

export async function createJobAction(formData: FormData) {
  await requirePermission("jobs:create");
  const values = parseJobFormData(formData);
  const job = await createJob(values);

  revalidatePath("/dashboard/jobs");
  redirect(`/dashboard/jobs/${job.id}`);
}

export async function updateJobAction(formData: FormData) {
  const context = await requirePermission("jobs:edit");
  const jobId = String(formData.get("jobId") ?? "");
  const values = parseJobFormData(formData);
  const job = await updateJob(jobId, values);

  if (!job) {
    notFound();
  }

  // "Save as draft" unpublishes the role; "Save & continue" leaves status as-is.
  if (formData.get("intent") === "draft" && job.status !== "draft") {
    await updateJobStatus(jobId, "draft");
  }

  const boardBase = `/board/${context.organization.slug}`;
  revalidatePath("/dashboard/jobs");
  revalidatePath(`/dashboard/jobs/${job.id}`);
  revalidatePath(boardBase);
  revalidatePath(`${boardBase}/jobs/${job.slug}`);
  redirect(`/dashboard/jobs/${job.id}`);
}

export async function updateJobStatusAction(formData: FormData) {
  const context = await requirePermission("jobs:edit");
  const jobId = String(formData.get("jobId") ?? "");
  const status = jobStatusSchema.parse(formData.get("status"));
  const job = await updateJobStatus(jobId, status);

  if (!job) {
    notFound();
  }

  const boardBase = `/board/${context.organization.slug}`;
  revalidatePath("/dashboard/jobs");
  revalidatePath(`/dashboard/jobs/${job.id}`);
  revalidatePath(boardBase);
  revalidatePath(`${boardBase}/jobs/${job.slug}`);
}

export async function trashJobAction(jobId: string): Promise<JobActionState> {
  await requirePermission("jobs:delete");
  const result = await trashJob(jobId);

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function restoreJobAction(jobId: string): Promise<JobActionState> {
  await requirePermission("jobs:delete");
  const result = await restoreJob(jobId);

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function permanentlyDeleteJobAction(
  jobId: string,
): Promise<JobActionState> {
  await requirePermission("jobs:delete");
  const result = await permanentlyDeleteJob(jobId);

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  revalidatePath("/dashboard/jobs");
  return { success: true };
}

export type GenerateJobDraftResult =
  | { ok: true; draft: JobDraft }
  | { ok: false; error: string };

/** AI job-description generator. Uses the workspace's configured provider key. */
export async function generateJobDraftAction(input: {
  title: string;
  department?: string;
  workplaceType?: string;
  keywords?: string[];
}): Promise<GenerateJobDraftResult> {
  const context = await requirePermission("jobs:create");

  if (!input.title?.trim()) {
    return { ok: false, error: "Add a job title first." };
  }

  const config = await getWorkspaceAiConfig(context.organization.id);
  if (!config) {
    return {
      ok: false,
      error: "Enable AI in Settings to generate with AI.",
    };
  }

  try {
    const draft = await generateJobDraftWithAI(config, {
      title: input.title.trim(),
      department: input.department?.trim() || undefined,
      workplaceType: input.workplaceType,
      keywords: input.keywords,
    });
    return { ok: true, draft };
  } catch (error) {
    return {
      ok: false,
      error: "Generation failed.",
    };
  }
}
