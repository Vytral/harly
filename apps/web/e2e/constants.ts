import path from "node:path";
import { tmpdir } from "node:os";

export const DEFAULT_E2E_DATABASE_URL =
  "postgresql://harly:harly@localhost:5432/harly_e2e";

export function resolveE2EDatabaseUrl(
  env?: { HARLY_E2E_DATABASE_URL?: string },
) {
  return (
    env?.HARLY_E2E_DATABASE_URL ||
    process.env.HARLY_E2E_DATABASE_URL ||
    DEFAULT_E2E_DATABASE_URL
  );
}

export const E2E_DATABASE_URL = resolveE2EDatabaseUrl();
export const E2E_BASE_URL = "http://127.0.0.1:3000";
// Production-mode E2E uses a narrowly allowed loopback origin so generated
// sign-in and document links stay inside the local test server. All secrets
// below are disposable fixtures and must never be used outside E2E.
export const E2E_RUNTIME_URL = E2E_BASE_URL;
export const E2E_BETTER_AUTH_SECRET =
  "harly-e2e-better-auth-secret-not-for-production-2026";
export const E2E_AI_ENCRYPTION_KEY =
  "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";
export const E2E_STORAGE_UPLOAD_SECRET =
  "harly-e2e-storage-upload-secret-not-for-production-2026";
export const E2E_SETUP_SECRET =
  "harly-e2e-setup-secret-not-for-production-2026";
export const E2E_INITIAL_ADMIN_EMAIL = "owner@harly-e2e.test";
export const E2E_CRON_SECRET = "harly-e2e-cron-secret-not-for-production-2026";
export const E2E_SMTP_PORT = 2525;
export const E2E_SMTP_CAPTURE = path.join(
  tmpdir(),
  "harly-e2e-smtp-capture.eml",
);

export const FIXTURE = {
  workspaceId: "e2e-hiring-workspace",
  workspaceSlug: "e2e-hiring-workspace",
  workspaceName: "Harly E2E Hiring",
  recruiterId: "e2e-hiring-recruiter",
  recruiterEmail: "recruiter@harly-e2e.test",
  recruiterPassword: "HarlyE2E!Recruiter2026",
  approverId: "e2e-hiring-approver",
  approverEmail: "approver@harly-e2e.test",
  approverPassword: "HarlyE2E!Approver2026",
  jobId: "11111111-1111-4111-8111-111111111111",
  jobSlug: "e2e-product-engineer",
  candidateEmail: "candidate@harly-e2e.test",
  candidateFirstName: "Ada",
  candidateLastName: "Lovelace",
  builderCandidateId: "33333333-3333-4333-8333-333333333333",
  builderCandidateEmail: "builder-candidate@harly-e2e.test",
} as const;

export const STAGE_IDS = [
  "22222222-2222-4222-8222-222222222220",
  "22222222-2222-4222-8222-222222222221",
  "22222222-2222-4222-8222-222222222222",
  "22222222-2222-4222-8222-222222222223",
  "22222222-2222-4222-8222-222222222224",
] as const;

export const STAGE_NAMES = [
  "Applied",
  "Screening",
  "Interview",
  "Offer",
  "Hired",
] as const;

export type Fixture = typeof FIXTURE;
