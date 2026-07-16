import "server-only";

import type { GreenhouseCandidateImportRow } from "./greenhouse";

const MAX_CANDIDATES = 5_000;
const MAX_RETRIES = 3;
const DETAIL_CONCURRENCY = 4;

export class WorkableImportError extends Error {}

type WorkableCandidateListItem = { id?: string | null };
type WorkableCandidate = {
  id?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  headline?: string | null;
  summary?: string | null;
  skills?: string[] | string | null;
  social_profiles?: Array<{ type?: string | null; url?: string | null }>;
  education_entries?: Array<{ id?: string | null; school?: string | null; degree?: string | null; field_of_study?: string | null; start_date?: string | null; end_date?: string | null }>;
  experience_entries?: Array<{ id?: string | null; company?: string | null; title?: string | null; summary?: string | null; start_date?: string | null; end_date?: string | null; current?: boolean | null }>;
  tags?: Array<string | { name?: string | null }>;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function splitName(candidate: WorkableCandidate): [string, string] {
  const first = text(candidate.firstname);
  const last = text(candidate.lastname);
  if (first && last) return [first, last];
  const parts = text(candidate.name).split(/\s+/).filter(Boolean);
  return [first || parts[0] || "", last || parts.slice(1).join(" ") || ""];
}

function profileUrl(candidate: WorkableCandidate, kind: "linkedin" | "github"): string {
  return candidate.social_profiles?.find((profile) => {
    const url = text(profile.url).toLowerCase();
    return text(profile.type).toLowerCase() === kind || url.includes(`${kind}.com`);
  })?.url?.trim() ?? "";
}

function websiteUrl(candidate: WorkableCandidate): string {
  return candidate.social_profiles?.find((profile) => {
    const url = text(profile.url).toLowerCase();
    return url && !url.includes("linkedin.com") && !url.includes("github.com");
  })?.url?.trim() ?? "";
}

export function workableCandidateToImportRow(candidate: WorkableCandidate, rowNumber: number): GreenhouseCandidateImportRow | null {
  const [firstName, lastName] = splitName(candidate);
  const email = text(candidate.email);
  if (!firstName || !lastName || !email) return null;
  const skills = Array.isArray(candidate.skills)
    ? candidate.skills.map(text).filter(Boolean)
    : text(candidate.skills).split(",").map((skill) => skill.trim()).filter(Boolean);
  const tags = (candidate.tags ?? []).map((tag) => typeof tag === "string" ? text(tag) : text(tag.name)).filter(Boolean);
  return {
    rowNumber,
    values: {
      firstName, lastName, email, phone: text(candidate.phone), location: text(candidate.address),
      linkedinUrl: profileUrl(candidate, "linkedin"), githubUrl: profileUrl(candidate, "github"),
      websiteUrl: websiteUrl(candidate), headline: text(candidate.headline), summary: text(candidate.summary),
      skills: JSON.stringify([...new Set([...skills, ...tags])].slice(0, 100)),
      educationEntries: JSON.stringify((candidate.education_entries ?? []).map((education, index) => ({
        id: `workable-education-${candidate.id ?? rowNumber}-${education.id ?? index}`,
        school: text(education.school), degree: text(education.degree) || null,
        field: text(education.field_of_study) || null, startDate: text(education.start_date) || null,
        endDate: text(education.end_date) || null, description: null,
      })).filter((education) => education.school)),
      experienceEntries: JSON.stringify((candidate.experience_entries ?? []).map((experience, index) => ({
        id: `workable-experience-${candidate.id ?? rowNumber}-${experience.id ?? index}`,
        company: text(experience.company), title: text(experience.title),
        startDate: text(experience.start_date) || null, endDate: text(experience.end_date) || null,
        current: typeof experience.current === "boolean" ? experience.current : !text(experience.end_date),
        location: null, description: text(experience.summary) || null,
      })).filter((experience) => experience.company || experience.title)),
    },
  };
}

function baseUrl(subdomain: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(subdomain)) throw new WorkableImportError("Enter the Workable subdomain from your account URL.");
  return `https://${subdomain}.workable.com/spi/v3`;
}

async function request(url: string, token: string, fetchImpl: typeof fetch): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (response.ok) return response;
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 250 * 2 ** attempt));
      continue;
    }
    if (response.status === 401 || response.status === 403) throw new WorkableImportError("Workable rejected the token or its r_candidates scope is missing.");
    throw new WorkableImportError(`Workable request failed (HTTP ${response.status}).`);
  }
  throw new WorkableImportError("Workable request failed.");
}

function safeNext(next: unknown, origin: string): string | null {
  if (typeof next !== "string" || !next) return null;
  const url = new URL(next, origin);
  if (url.origin !== origin) throw new WorkableImportError("Workable returned an unsafe pagination URL.");
  return url.toString();
}

/** Lists all candidates then reads each full profile, so sparse index responses never lose profile data. */
export async function fetchWorkableCandidateImportRows(input: { subdomain: string; apiToken: string }, fetchImpl: typeof fetch = fetch): Promise<{ rows: GreenhouseCandidateImportRow[]; skipped: number }> {
  const token = input.apiToken.trim();
  if (token.length < 16 || token.length > 1_024) throw new WorkableImportError("Enter a valid Workable API token.");
  const root = baseUrl(input.subdomain.trim());
  const origin = new URL(root).origin;
  let url: string | null = `${root}/candidates?limit=100`;
  const candidateIds: string[] = [];
  while (url && candidateIds.length < MAX_CANDIDATES) {
    const response = await request(url, token, fetchImpl);
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !Array.isArray((body as { candidates?: unknown }).candidates)) throw new WorkableImportError("Workable returned an invalid candidate response.");
    candidateIds.push(...((body as { candidates: WorkableCandidateListItem[] }).candidates).map((candidate) => text(candidate.id)).filter(Boolean));
    url = safeNext((body as { paging?: { next?: unknown } }).paging?.next, origin);
  }
  if (url || candidateIds.length > MAX_CANDIDATES) throw new WorkableImportError(`This import exceeds ${MAX_CANDIDATES.toLocaleString()} candidates. Contact support to run a staged migration.`);
  const details: WorkableCandidate[] = [];
  for (let start = 0; start < candidateIds.length; start += DETAIL_CONCURRENCY) {
    const group = candidateIds.slice(start, start + DETAIL_CONCURRENCY);
    const records = await Promise.all(group.map(async (id) => {
      const response = await request(`${root}/candidates/${encodeURIComponent(id)}`, token, fetchImpl);
      return await response.json() as WorkableCandidate;
    }));
    details.push(...records);
  }
  let skipped = 0;
  const rows = details.flatMap((candidate, index) => {
    const row = workableCandidateToImportRow(candidate, index + 2);
    if (!row) skipped += 1;
    return row ? [row] : [];
  });
  return { rows, skipped };
}
