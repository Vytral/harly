import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  enforceRateLimit: vi.fn(),
  resolvePublicWorkspace: vi.fn(),
  getPublicJobApplicationContext: vi.fn(),
  createPublicApplication: vi.fn(),
  createApplicationFormSchema: vi.fn(),
  validateApplicationQuestionAnswers: vi.fn(),
  verifyCaptchaToken: vi.fn(),
  sendApplicationReceivedEmails: vi.fn(),
  scheduleAutoScore: vi.fn(),
  scheduleAutoDuplicateCheck: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/server/api/auth", () => ({
  getRequestRateLimit: () => null,
}));
vi.mock("@/server/api/idempotency", () => ({
  releaseIdempotencyReservation: vi.fn(async () => undefined),
}));
vi.mock("@/server/observability/metrics", () => ({
  recordHttpError: vi.fn(),
  recordHttpRequest: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/features/applications/data", () => ({
  getPublicJobApplicationContext: mocks.getPublicJobApplicationContext,
  createPublicApplication: mocks.createPublicApplication,
}));
vi.mock("@/features/applications/notifications", () => ({
  sendApplicationReceivedEmails: mocks.sendApplicationReceivedEmails,
}));
vi.mock("@/features/applications/auto-score", () => ({
  scheduleAutoScore: mocks.scheduleAutoScore,
}));
vi.mock("@/features/applications/auto-duplicates", () => ({
  scheduleAutoDuplicateCheck: mocks.scheduleAutoDuplicateCheck,
}));
vi.mock("@/lib/validations/applications", () => ({
  createApplicationFormSchema: mocks.createApplicationFormSchema,
  validateApplicationQuestionAnswers: mocks.validateApplicationQuestionAnswers,
}));
vi.mock("@/server/api/public", () => ({
  resolvePublicWorkspace: mocks.resolvePublicWorkspace,
}));
vi.mock("@/server/api/ratelimit", () => ({
  clientIp: () => "203.0.113.10",
  enforceRateLimit: mocks.enforceRateLimit,
  rateLimitResultFromError: () => null,
}));
vi.mock("@/lib/captcha", () => ({
  verifyCaptchaToken: mocks.verifyCaptchaToken,
}));

import { ApiError } from "@harly/api";
import { POST } from "./route";

const APPLICATION_VALUES = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  questionAnswers: {},
};

const CONTEXT = {
  workspaceId: "ws-1",
  applicationConfig: {
    questions: [],
    legalConfigured: true,
    consentText: "I agree to Acme's privacy policy.",
  },
};

function request(body: Record<string, unknown>) {
  return new Request("https://harly.example/api/public/v1/jobs/engineer/applications", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "candidate-browser/1.0",
      "x-real-ip": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/v1/jobs/[slug]/applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue({
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });
    mocks.resolvePublicWorkspace.mockResolvedValue({
      workspaceId: "ws-1",
      slug: "acme",
    });
    mocks.getPublicJobApplicationContext.mockResolvedValue(CONTEXT);
    mocks.createApplicationFormSchema.mockReturnValue({
      safeParse: () => ({ success: true, data: APPLICATION_VALUES }),
    });
    mocks.validateApplicationQuestionAnswers.mockReturnValue({});
    mocks.verifyCaptchaToken.mockResolvedValue(true);
    mocks.createPublicApplication.mockResolvedValue({
      ok: true,
      applicationId: "application-1",
      candidateId: "candidate-1",
      email: {
        candidateEmail: "ada@example.com",
        candidateFirstName: "Ada",
        candidateName: "Ada Lovelace",
        jobTitle: "Engineer",
        workspaceId: "ws-1",
        workspaceName: "Acme",
        workspaceSlug: "acme",
        portalEnabled: false,
        applicationId: "application-1",
        ownerEmails: [],
      },
    });
  });

  it("returns the transport-level 429 and stops before resolving the workspace", async () => {
    mocks.enforceRateLimit.mockRejectedValue(ApiError.rateLimited());

    const response = await POST(request({}), {
      params: Promise.resolve({ slug: "engineer" }),
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: { code: "rate_limited" },
    });
    expect(mocks.resolvePublicWorkspace).not.toHaveBeenCalled();
  });

  it("requires configured legal consent before creating an application", async () => {
    const response = await POST(
      request({ ...APPLICATION_VALUES, consentGiven: false }),
      { params: Promise.resolve({ slug: "engineer" }) },
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { message: expect.stringMatching(/privacy policy/i) },
    });
    expect(mocks.createPublicApplication).not.toHaveBeenCalled();
  });

  it("passes server-resolved consent text and request evidence to the domain service", async () => {
    const response = await POST(
      request({ ...APPLICATION_VALUES, consentGiven: true }),
      { params: Promise.resolve({ slug: "engineer" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.createPublicApplication).toHaveBeenCalledWith(
      { jobSlug: "engineer", workspaceSlug: "acme" },
      APPLICATION_VALUES,
      {
        consent: {
          consentText: "I agree to Acme's privacy policy.",
          ipAddress: "203.0.113.10",
          userAgent: "candidate-browser/1.0",
        },
      },
    );
  });

  it("waits for durable application email enqueue before acknowledging", async () => {
    let release: (() => void) | undefined;
    mocks.sendApplicationReceivedEmails.mockImplementation(
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    let settled = false;
    const responsePromise = POST(
      request({ ...APPLICATION_VALUES, consentGiven: true }),
      { params: Promise.resolve({ slug: "engineer" }) },
    ).then((response) => {
      settled = true;
      return response;
    });

    await vi.waitFor(() => expect(mocks.sendApplicationReceivedEmails).toHaveBeenCalled());
    expect(settled).toBe(false);
    release?.();
    await expect(responsePromise).resolves.toMatchObject({ status: 201 });
  });
});
