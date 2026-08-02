import "server-only";

import type { GreenhouseCandidateImportRow } from "./greenhouse";
import {
  capExceededMessage,
  createRequestLimiter,
  IMPORT_MAX_CANDIDATES,
  retryAfterMs,
  type Sleep,
  sleep,
} from "./shared";

const API_ORIGIN = "https://api.join.com";
const PAGE_SIZE = 50;
const MAX_RETRIES = 3;

export class JoinImportError extends Error {}

type JoinCandidate = {
  id?: string | number | null;
  firstName?: string | null;
  first_name?: string | null;
  lastName?: string | null;
  last_name?: string | null;
  name?: string | null;
  fullName?: string | null;
  full_name?: string | null;
  email?: string | null;
  emailAddress?: string | null;
  email_address?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
  phone_number?: string | null;
  location?:
    | string
    | { name?: string | null; city?: string | null; country?: string | null }
    | null;
  address?: string | null;
  headline?: string | null;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  linkedinUrl?: string | null;
  linkedin_url?: string | null;
  linkedInUrl?: string | null;
  githubUrl?: string | null;
  github_url?: string | null;
  websiteUrl?: string | null;
  website_url?: string | null;
  tags?: Array<string | { name?: string | null }> | null;
  skills?: string[] | string | null;
  education?: Array<Record<string, unknown>> | null;
  educations?: Array<Record<string, unknown>> | null;
  experience?: Array<Record<string, unknown>> | null;
  employments?: Array<Record<string, unknown>> | null;
};

type JoinApplication = JoinCandidate & {
  candidate?: JoinCandidate | null;
  applicant?: JoinCandidate | null;
  job?: { id?: number | string | null; title?: string | null } | null;
};

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function firstText(...values: unknown[]): string {
  return values.map(text).find(Boolean) ?? "";
}

function splitName(candidate: JoinCandidate): [string, string] {
  const first = firstText(candidate.firstName, candidate.first_name);
  const last = firstText(candidate.lastName, candidate.last_name);
  if (first && last) return [first, last];
  const fullName = firstText(
    candidate.name,
    candidate.fullName,
    candidate.full_name,
  );
  const parts = fullName.split(/\s+/).filter(Boolean);
  return [first || parts[0] || "", last || parts.slice(1).join(" ") || ""];
}

function location(value: JoinCandidate["location"]): string {
  if (typeof value === "string") return value.trim();
  return (
    [text(value?.city), text(value?.country)].filter(Boolean).join(", ") ||
    text(value?.name)
  );
}

function profileUrl(
  candidate: JoinCandidate,
  kind: "linkedin" | "github",
): string {
  return firstText(
    kind === "linkedin" ? candidate.linkedinUrl : candidate.githubUrl,
    kind === "linkedin" ? candidate.linkedin_url : candidate.github_url,
    kind === "linkedin" ? candidate.linkedInUrl : undefined,
  );
}

function websiteUrl(candidate: JoinCandidate): string {
  const value = firstText(candidate.websiteUrl, candidate.website_url);
  return value &&
    !value.toLowerCase().includes("linkedin.com") &&
    !value.toLowerCase().includes("github.com")
    ? value
    : "";
}

function listValues(
  value: JoinCandidate["skills"] | JoinCandidate["tags"],
): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? text(item) : text(item.name)))
      .filter(Boolean);
  }
  return text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function entries(
  value: Array<Record<string, unknown>> | null | undefined,
  kind: "education" | "experience",
  candidateId: string,
): unknown[] {
  return (value ?? [])
    .map((entry, index) => {
      const get = (...keys: string[]) =>
        firstText(...keys.map((key) => entry[key]));
      if (kind === "education") {
        return {
          id: `join-education-${candidateId}-${get("id") || index}`,
          school: get("school", "schoolName", "school_name", "institution"),
          degree: get("degree") || null,
          field:
            get("field", "fieldOfStudy", "field_of_study", "discipline") ||
            null,
          startDate: get("startDate", "start_date") || null,
          endDate: get("endDate", "end_date") || null,
          description: get("description", "summary") || null,
        };
      }
      return {
        id: `join-experience-${candidateId}-${get("id") || index}`,
        company: get("company", "companyName", "company_name", "employer"),
        title: get("title", "position", "role"),
        startDate: get("startDate", "start_date") || null,
        endDate: get("endDate", "end_date") || null,
        current: !get("endDate", "end_date"),
        location: get("location") || null,
        description: get("description", "summary") || null,
      };
    })
    .filter((entry) =>
      kind === "education"
        ? Boolean((entry as { school: string }).school)
        : Boolean(
            (entry as { company: string; title: string }).company ||
            (entry as { title: string }).title,
          ),
    )
    .slice(0, 100);
}

export function joinApplicationToImportRow(
  application: JoinApplication,
  rowNumber: number,
): GreenhouseCandidateImportRow | null {
  const candidate =
    application.candidate ?? application.applicant ?? application;
  const [firstName, lastName] = splitName(candidate);
  const email = firstText(
    candidate.email,
    candidate.emailAddress,
    candidate.email_address,
  );
  if (!firstName || !lastName || !email) return null;

  const candidateId = firstText(candidate.id, application.id, rowNumber);
  const skills = [
    ...new Set([
      ...listValues(candidate.skills),
      ...listValues(candidate.tags),
    ]),
  ].slice(0, 100);
  return {
    rowNumber,
    values: {
      firstName,
      lastName,
      email,
      phone: firstText(
        candidate.phone,
        candidate.phoneNumber,
        candidate.phone_number,
      ),
      location: location(candidate.location) || text(candidate.address),
      linkedinUrl: profileUrl(candidate, "linkedin"),
      githubUrl: profileUrl(candidate, "github"),
      websiteUrl: websiteUrl(candidate),
      headline: firstText(candidate.headline, candidate.title),
      summary: firstText(candidate.summary, candidate.description),
      skills: JSON.stringify(skills),
      educationEntries: JSON.stringify(
        entries(
          candidate.education ?? candidate.educations,
          "education",
          candidateId,
        ),
      ),
      experienceEntries: JSON.stringify(
        entries(
          candidate.experience ?? candidate.employments,
          "experience",
          candidateId,
        ),
      ),
    },
  };
}

function applicationPage(body: unknown): JoinApplication[] {
  if (Array.isArray(body)) return body as JoinApplication[];
  if (typeof body !== "object" || body === null) return [];
  const record = body as Record<string, unknown>;
  for (const key of ["data", "applications", "items", "results"]) {
    if (Array.isArray(record[key])) return record[key] as JoinApplication[];
  }
  return [];
}

async function request(
  url: string,
  token: string,
  fetchImpl: typeof fetch,
  acquire: () => Promise<void>,
  sleepImpl: Sleep,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await acquire();
    const response = await fetchImpl(url, {
      headers: { Authorization: token, Accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) return response;
    if (
      (response.status === 429 || response.status >= 500) &&
      attempt < MAX_RETRIES
    ) {
      await sleepImpl(retryAfterMs(response) ?? 250 * 2 ** attempt);
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      throw new JoinImportError(
        "JOIN rejected the API token or it lacks application read access.",
      );
    }
    throw new JoinImportError(`JOIN request failed (HTTP ${response.status}).`);
  }
  throw new JoinImportError("JOIN request failed.");
}

export async function fetchJoinCandidateImportRows(
  tokenInput: string,
  fetchImpl: typeof fetch = fetch,
  sleepImpl: Sleep = sleep,
): Promise<{ rows: GreenhouseCandidateImportRow[]; skipped: number }> {
  const token = tokenInput.trim();
  if (token.length < 16 || token.length > 1_024)
    throw new JoinImportError("Enter a valid JOIN API token.");

  const acquire = createRequestLimiter(sleepImpl);
  const applications: JoinApplication[] = [];
  for (let page = 1; ; page += 1) {
    const url = `${API_ORIGIN}/v2/applications?page=${page}&pageSize=${PAGE_SIZE}`;
    const response = await request(url, token, fetchImpl, acquire, sleepImpl);
    const currentPage = applicationPage(await response.json());
    if (currentPage.length === 0) break;
    applications.push(...currentPage);
    if (applications.length > IMPORT_MAX_CANDIDATES)
      throw new JoinImportError(capExceededMessage());
    if (currentPage.length < PAGE_SIZE) break;
  }

  let skipped = 0;
  const rows = applications.flatMap((application, index) => {
    const row = joinApplicationToImportRow(application, index + 2);
    if (!row) skipped += 1;
    return row ? [row] : [];
  });
  return { rows, skipped };
}
