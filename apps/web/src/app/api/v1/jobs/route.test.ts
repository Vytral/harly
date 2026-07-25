import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  actor: vi.fn(),
  reserve: vi.fn(),
  complete: vi.fn(),
  getRequestRateLimit: vi.fn(() => null),
}));

vi.mock("@/features/jobs/service", () => ({
  createJobForApi: mocks.create,
  listJobsForApi: mocks.list,
  serializeJob: (job: {
    id: string;
    title: string;
    slug: string;
    status: string;
    department?: string | null;
    location?: string | null;
    employmentType: string;
    workplaceType: string;
    description: string;
    requirements?: string | null;
    benefits?: string | null;
    keywords?: string[];
    salaryMin?: number | null;
    salaryMax?: number | null;
    currency?: string | null;
    salaryPeriod?: string | null;
    publishedAt?: string | null;
    createdAt?: string | Date;
    updatedAt?: string | Date;
  }) => ({
    id: job.id,
    title: job.title,
    slug: job.slug,
    status: job.status,
    department: job.department ?? null,
    location: job.location ?? null,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    description: job.description,
    requirements: job.requirements ?? null,
    benefits: job.benefits ?? null,
    keywords: job.keywords ?? [],
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    currency: job.currency ?? null,
    salaryPeriod: job.salaryPeriod ?? null,
    publishedAt: job.publishedAt ?? null,
    createdAt: job.createdAt ?? "2026-01-10T14:00:00.000Z",
    updatedAt: job.updatedAt ?? "2026-01-10T14:00:00.000Z",
  }),
}));

vi.mock("@/server/api/auth", () => ({
  authenticateApiKey: mocks.authenticate,
  hasApiScope: (scopes: string[], scope: string) => scopes.includes(scope),
  getRequestRateLimit: mocks.getRequestRateLimit,
}));
vi.mock("@/server/api/actor", () => ({
  resolveWorkspaceActorUserId: mocks.actor,
}));
vi.mock("@/server/api/idempotency", () => ({
  reserveIdempotencyKey: mocks.reserve,
  releaseIdempotencyReservation: vi.fn(async () => undefined),
}));

import { GET, POST } from "./route";
import {
  listJobsContract,
  createJobContract,
  validateRouteResponse,
} from "@/server/api/contracts";

describe("Jobs Domain Contract & Route Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/v1/jobs", () => {
    it("returns paginated jobs list conforming strictly to the contract response schema", async () => {
      mocks.authenticate.mockResolvedValue({
        workspaceId: "ws-1",
        keyId: "key-1",
        type: "secret",
        scopes: ["jobs:read"],
      });

      const mockJob = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: "Senior Developer",
        slug: "senior-developer",
        status: "open",
        department: "Engineering",
        location: "Remote",
        employmentType: "full_time",
        workplaceType: "remote",
        description: "Great role",
        requirements: null,
        benefits: null,
        keywords: ["react"],
        salaryMin: null,
        salaryMax: null,
        currency: null,
        salaryPeriod: null,
        publishedAt: "2026-01-10T14:00:00.000Z",
        createdAt: new Date("2026-01-10T14:00:00.000Z"),
        updatedAt: new Date("2026-01-10T14:00:00.000Z"),
      };

      mocks.list.mockResolvedValue([mockJob]);

      const response = await GET(
        new Request("https://example.test/api/v1/jobs"),
      );

      // Validate response against the contract schema automatically
      const body = await validateRouteResponse(listJobsContract, response, 200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("Senior Developer");
      expect(mocks.authenticate).toHaveBeenCalledWith(
        expect.anything(),
        listJobsContract.auth?.scopes?.[0],
      );
    });
  });

  describe("POST /api/v1/jobs", () => {
    it("creates a job and verifies response adheres to createJobRoute schema", async () => {
      mocks.authenticate.mockResolvedValue({
        workspaceId: "ws-1",
        keyId: "key-1",
        createdById: "user-1",
        type: "secret",
        scopes: ["jobs:write"],
      });
      mocks.actor.mockResolvedValue("user-1");
      mocks.reserve.mockResolvedValue({
        kind: "reserved",
        key: "idempotency-1",
        complete: mocks.complete,
      });

      const createdJob = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: "Staff Engineer",
        slug: "staff-engineer",
        status: "draft",
        department: "Engineering",
        location: "Santiago",
        employmentType: "full_time",
        workplaceType: "onsite",
        description: "Role details",
        requirements: "TypeScript",
        benefits: "Insurance",
        keywords: ["ts"],
        salaryMin: 5000000,
        salaryMax: 7000000,
        currency: "CLP",
        salaryPeriod: "monthly",
        publishedAt: null,
        createdAt: "2026-01-10T14:00:00.000Z",
        updatedAt: "2026-01-10T14:00:00.000Z",
      };

      mocks.create.mockResolvedValue(createdJob);

      const response = await POST(
        new Request("https://example.test/api/v1/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Staff Engineer",
            description: "Role details",
            employmentType: "full_time",
            workplaceType: "onsite",
          }),
        }),
      );

      // Validate response against contract schema
      const body = await validateRouteResponse(
        createJobContract,
        response,
        201,
      );
      expect(body.data.id).toBe("123e4567-e89b-12d3-a456-426614174000");
      expect(mocks.authenticate).toHaveBeenCalledWith(
        expect.anything(),
        createJobContract.auth?.scopes?.[0],
      );
    });
  });
});
