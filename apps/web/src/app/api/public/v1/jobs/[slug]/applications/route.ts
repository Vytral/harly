import { ApiError } from "@harly/api";
import { after } from "next/server";

import {
  createPublicApplication,
  getPublicJobApplicationContext,
} from "@/features/applications/data";
import { sendApplicationReceivedEmails } from "@/features/applications/notifications";
import { scheduleAutoScore } from "@/features/applications/auto-score";
import { scheduleAutoDuplicateCheck } from "@/features/applications/auto-duplicates";
import {
  createApplicationFormSchema,
  validateApplicationQuestionAnswers,
} from "@/lib/validations/applications";
import { resolvePublicWorkspace } from "@/server/api/public";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { apiOk, corsPreflight, withApi } from "@/server/api/respond";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ slug: string }> };

/**
 * POST /api/public/v1/jobs/{slug}/applications — submit an application from a
 * custom form or the embed widget. CORS-open; rate-limited + honeypot-guarded.
 */
export const POST = withApi(
  async (request, context) => {
    enforceRateLimit(`public:apply:${clientIp(request)}`, {
      limit: 10,
      windowMs: 60_000,
    });

    const { slug } = await (context as Context).params;
    const workspace = await resolvePublicWorkspace(
      request,
      "applications:write",
    );

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object") {
      throw ApiError.badRequest("Expected a JSON body.");
    }

    // Anti-bot: the public apply API is the documented custom-form / embed
    // entrypoint, so the Turnstile challenge MUST be enforced here too (not
    // only in the Server Action). When a global secret is configured this is
    // mandatory for every workspace; the token is supplied by the embed widget.
    const token = body.turnstileToken;
    const tokenStr =
      typeof token === "string" && token.length > 0 ? token : null;
    const turnstileOk = await verifyTurnstileToken(
      tokenStr,
      workspace.workspaceId,
      clientIp(request),
    );
    if (!turnstileOk) {
      throw ApiError.forbidden(
        "Verification failed. Complete the challenge and try again.",
      );
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

    void sendApplicationReceivedEmails(result.email);
    after(async () => {
      await Promise.allSettled([
        scheduleAutoScore(result.applicationId, jobContext.workspaceId),
        scheduleAutoDuplicateCheck(result.candidateId, jobContext.workspaceId),
      ]);
    });

    return apiOk(
      { received: true, message: "Application received." },
      { cors: true, status: 201 },
    );
  },
  { cors: true },
);

export function OPTIONS() {
  return corsPreflight();
}
