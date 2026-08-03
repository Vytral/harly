import path from "node:path";
import { tmpdir } from "node:os";

export const E2E_DATABASE_URL =
  "postgresql://harly:harly@localhost:5432/harly_e2e";
export const E2E_BASE_URL = "http://127.0.0.1:3000";
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
  jobId: "11111111-1111-4111-8111-111111111111",
  jobSlug: "e2e-product-engineer",
  candidateEmail: "candidate@harly-e2e.test",
  candidateFirstName: "Ada",
  candidateLastName: "Lovelace",
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
