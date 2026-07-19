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

const API_URL = "https://api.lever.co/v1/opportunities";
const MAX_RETRIES = 3;

export class LeverImportError extends Error {}

type Opportunity = { id?: string; name?: string; headline?: string; emails?: string[]; phones?: Array<{ value?: string }>; location?: string; links?: string[]; tags?: string[] };
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function splitName(name: string): [string, string] { const parts = name.split(/\s+/).filter(Boolean); return [parts[0] ?? "", parts.slice(1).join(" ")]; }

export function leverOpportunityToImportRow(opportunity: Opportunity, rowNumber: number): GreenhouseCandidateImportRow | null {
  const [firstName, lastName] = splitName(text(opportunity.name));
  const email = (opportunity.emails ?? []).map(text).find(Boolean) ?? "";
  if (!firstName || !lastName || !email) return null;
  const links = (opportunity.links ?? []).map(text).filter(Boolean);
  return { rowNumber, values: {
    firstName, lastName, email, phone: opportunity.phones?.map((phone) => text(phone.value)).find(Boolean) ?? "", location: text(opportunity.location), headline: text(opportunity.headline), summary: "",
    linkedinUrl: links.find((link) => link.toLowerCase().includes("linkedin.com")) ?? "", githubUrl: links.find((link) => link.toLowerCase().includes("github.com")) ?? "", websiteUrl: links.find((link) => !link.toLowerCase().includes("linkedin.com") && !link.toLowerCase().includes("github.com")) ?? "",
    skills: JSON.stringify((opportunity.tags ?? []).map(text).filter(Boolean).slice(0, 100)), educationEntries: "[]", experienceEntries: "[]",
  }};
}

async function request(
  url: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  acquire: () => Promise<void>,
  sleepImpl: Sleep,
): Promise<unknown> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await acquire();
    const response = await fetchImpl(url, { headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`, Accept: "application/json" }, cache: "no-store" });
    if (response.ok) return await response.json();
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
      const retryDelay = retryAfterMs(response) ?? 250 * 2 ** attempt;
      await sleepImpl(retryDelay + Math.min(250, attempt * 100));
      continue;
    }
    if (response.status === 401 || response.status === 403) throw new LeverImportError("Lever rejected the API key or it lacks opportunities read access.");
    throw new LeverImportError(`Lever request failed (HTTP ${response.status}).`);
  }
  throw new LeverImportError("Lever request failed.");
}

export async function fetchLeverCandidateImportRows(
  apiKeyInput: string,
  fetchImpl: typeof fetch = fetch,
  sleepImpl: Sleep = sleep,
): Promise<{ rows: GreenhouseCandidateImportRow[]; skipped: number }> {
  const apiKey = apiKeyInput.trim();
  if (apiKey.length < 16 || apiKey.length > 1_024) throw new LeverImportError("Enter a valid Lever API key.");
  const acquire = createRequestLimiter(sleepImpl);
  const requestLever = (url: string) => request(url, apiKey, fetchImpl, acquire, sleepImpl);
  let url: string | null = `${API_URL}?limit=100`; const opportunities: Opportunity[] = [];
  while (url) {
    const body = await requestLever(url);
    if (typeof body !== "object" || body === null || !Array.isArray((body as { data?: unknown }).data)) throw new LeverImportError("Lever returned an invalid opportunities response.");
    const page = body as { data: Opportunity[]; hasNext?: boolean; next?: string };
    opportunities.push(...page.data);
    if (opportunities.length > IMPORT_MAX_CANDIDATES) throw new LeverImportError(capExceededMessage("opportunities"));
    const next = text(page.next);
    url = page.hasNext && next ? `${API_URL}?limit=100&offset=${encodeURIComponent(next)}` : null;
    if (page.hasNext && !next) throw new LeverImportError("Lever returned a page without its next offset.");
  }
  let skipped = 0;
  const rows = opportunities.flatMap((opportunity, index) => { const row = leverOpportunityToImportRow(opportunity, index + 2); if (!row) skipped += 1; return row ? [row] : []; });
  return { rows, skipped };
}
