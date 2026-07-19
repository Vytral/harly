import "server-only";

import type { GreenhouseCandidateImportRow } from "./greenhouse";
import { capExceededMessage, IMPORT_MAX_CANDIDATES } from "./shared";

const API_URL = "https://api.ashbyhq.com";
const MAX_RETRIES = 3;
const DETAIL_CONCURRENCY = 4;

export class AshbyImportError extends Error {}

type AshbyCandidate = {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  primaryEmailAddress?: string;
  phoneNumber?: string;
  linkedInUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
  location?: string | { name?: string; city?: string; country?: string };
  headline?: string;
  summary?: string;
  tags?: Array<string | { name?: string }>;
  socialLinks?: Array<{ type?: string; url?: string }>;
  education?: Array<{ id?: string; school?: string; degree?: string; fieldOfStudy?: string; startDate?: string; endDate?: string }>;
  employment?: Array<{ id?: string; company?: string; title?: string; startDate?: string; endDate?: string; description?: string }>;
};

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function splitName(candidate: AshbyCandidate): [string, string] {
  const first = text(candidate.firstName); const last = text(candidate.lastName);
  if (first && last) return [first, last];
  const parts = text(candidate.name).split(/\s+/).filter(Boolean);
  return [first || parts[0] || "", last || parts.slice(1).join(" ") || ""];
}
function location(value: AshbyCandidate["location"]): string {
  if (typeof value === "string") return value.trim();
  return [text(value?.city), text(value?.country)].filter(Boolean).join(", ") || text(value?.name);
}
function socialUrl(candidate: AshbyCandidate, type: "linkedin" | "github"): string {
  return candidate.socialLinks?.find((link) => text(link.type).toLowerCase() === type || text(link.url).toLowerCase().includes(`${type}.com`))?.url?.trim() ?? "";
}

export function ashbyCandidateToImportRow(candidate: AshbyCandidate, rowNumber: number): GreenhouseCandidateImportRow | null {
  const [firstName, lastName] = splitName(candidate);
  const email = text(candidate.email) || text(candidate.primaryEmailAddress);
  if (!firstName || !lastName || !email) return null;
  const tags = (candidate.tags ?? []).map((tag) => typeof tag === "string" ? text(tag) : text(tag.name)).filter(Boolean);
  return { rowNumber, values: {
    firstName, lastName, email, phone: text(candidate.phoneNumber), location: location(candidate.location),
    linkedinUrl: text(candidate.linkedInUrl) || socialUrl(candidate, "linkedin"),
    githubUrl: text(candidate.githubUrl) || socialUrl(candidate, "github"), websiteUrl: text(candidate.websiteUrl),
    headline: text(candidate.headline), summary: text(candidate.summary), skills: JSON.stringify(tags.slice(0, 100)),
    educationEntries: JSON.stringify((candidate.education ?? []).map((entry, index) => ({ id: `ashby-education-${candidate.id ?? rowNumber}-${entry.id ?? index}`, school: text(entry.school), degree: text(entry.degree) || null, field: text(entry.fieldOfStudy) || null, startDate: text(entry.startDate) || null, endDate: text(entry.endDate) || null, description: null })).filter((entry) => entry.school)),
    experienceEntries: JSON.stringify((candidate.employment ?? []).map((entry, index) => ({ id: `ashby-employment-${candidate.id ?? rowNumber}-${entry.id ?? index}`, company: text(entry.company), title: text(entry.title), startDate: text(entry.startDate) || null, endDate: text(entry.endDate) || null, current: !text(entry.endDate), location: null, description: text(entry.description) || null })).filter((entry) => entry.company || entry.title)),
  }};
}

async function request(endpoint: string, apiKey: string, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<unknown> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetchImpl(`${API_URL}/${endpoint}`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`, Accept: "application/json; version=1", "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    if (response.ok) return await response.json();
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) { await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt)); continue; }
    if (response.status === 401 || response.status === 403) throw new AshbyImportError("Ashby rejected the API key or its candidatesRead permission is missing.");
    throw new AshbyImportError(`Ashby request failed (HTTP ${response.status}).`);
  }
  throw new AshbyImportError("Ashby request failed.");
}

/** Read-only full import. Ashby's cursor/sync protocol keeps this ready for incremental sync later. */
export async function fetchAshbyCandidateImportRows(apiKeyInput: string, fetchImpl: typeof fetch = fetch): Promise<{ rows: GreenhouseCandidateImportRow[]; skipped: number; syncToken: string | null }> {
  const apiKey = apiKeyInput.trim();
  if (apiKey.length < 16 || apiKey.length > 1_024) throw new AshbyImportError("Enter a valid Ashby API key.");
  let cursor = "start"; const ids: string[] = []; let syncToken: string | null = null;
  do {
    const body = await request("candidate.list", apiKey, { cursor, limit: 100 }, fetchImpl);
    if (typeof body !== "object" || body === null || !Array.isArray((body as { results?: unknown }).results)) throw new AshbyImportError("Ashby returned an invalid candidate response.");
    const page = body as { results: AshbyCandidate[]; moreDataAvailable?: boolean; nextCursor?: string; syncToken?: string };
    ids.push(...page.results.map((candidate) => text(candidate.id)).filter(Boolean));
    if (ids.length > IMPORT_MAX_CANDIDATES) throw new AshbyImportError(capExceededMessage());
    syncToken = text(page.syncToken) || syncToken;
    if (!page.moreDataAvailable) break;
    cursor = text(page.nextCursor);
    if (!cursor) throw new AshbyImportError("Ashby returned a page without its next cursor.");
  } while (true);
  const details: AshbyCandidate[] = [];
  for (let start = 0; start < ids.length; start += DETAIL_CONCURRENCY) details.push(...await Promise.all(ids.slice(start, start + DETAIL_CONCURRENCY).map(async (id) => await request("candidate.info", apiKey, { id }, fetchImpl) as AshbyCandidate)));
  let skipped = 0;
  const rows = details.flatMap((candidate, index) => { const row = ashbyCandidateToImportRow(candidate, index + 2); if (!row) skipped += 1; return row ? [row] : []; });
  return { rows, skipped, syncToken };
}
