import { ApiError } from "@harly/api";

import {
  createPublicApplication,
  getPublicJobApplicationContext,
} from "@/features/applications/data";
import { sendApplicationReceivedEmails } from "@/features/applications/notifications";
import {
  createApplicationFormSchema,
  validateApplicationQuestionAnswers,
} from "@/lib/validations/applications";
import { resolvePublicWorkspace } from "@/server/api/public";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { apiOk, corsPreflight, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

/**
 * POST /api/public/v1/jobs/{slug}/applications — submit an application from a
 * custom form or the embed widget. CORS-open; rate-limited + honeypot-guarded.
 */
export const POST = withApi(async (request, context) => {
  enforceRateLimit(`public:apply:${clientIp(request)}`, {
    limit: 10,
    windowMs: 60_000,
  });

  const { slug } = await (context as Context).params;
  const workspace = await resolvePublicWorkspace(request, "applications:write");

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body || typeof body !== "object") {
    throw ApiError.badRequest("Expected a JSON body.");
  }

  // Honeypot: real users never fill this hidden field.
  if (typeof body._hp === "string" && body._hp.trim().length > 0) {
    throw ApiError.badRequest("Rejected.");
  }

  const jobContext = await getPublicJobApplicationContext({
    jobSlug: slug,
    workspaceSlug: workspace.slug,
  });
  if (!jobContext) {
    throw ApiError.notFound("Job not available.");
  }

  const schema = createApplicationFormSchema(jobContext.applicationConfig);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.unprocessable(
      "Validation failed.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const questionErrors = validateApplicationQuestionAnswers(
    parsed.data.questionAnswers,
    jobContext.applicationConfig.questions,
  );
  if (Object.keys(questionErrors).length > 0) {
    throw ApiError.unprocessable("Some answers are invalid.", questionErrors);
  }

  const result = await createPublicApplication(
    { jobSlug: slug, workspaceSlug: workspace.slug },
    parsed.data,
  );
  if (!result.ok) {
    throw ApiError.conflict(result.message);
  }

  sendApplicationReceivedEmails(result.email);

  return apiOk(
    { received: true, message: "Application received." },
    { cors: true, status: 201 },
  );
}, { cors: true });

export function OPTIONS() {
  return corsPreflight();
}
