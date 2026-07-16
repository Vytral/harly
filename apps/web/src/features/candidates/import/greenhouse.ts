import "server-only";

export type GreenhouseCandidateImportRow = {
  rowNumber: number;
  values: Record<string, string>;
};

type GreenhouseCandidate = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  email_addresses?: Array<{ value?: string | null }>;
  phone_numbers?: Array<{ value?: string | null }>;
  addresses?: Array<{ value?: string | null }>;
  website_addresses?: Array<{ url?: string | null; value?: string | null; type?: string | null }>;
  social_media_addresses?: Array<{ url?: string | null; value?: string | null; type?: string | null }>;
  educations?: Array<{ id?: number; school_name?: string | null; degree?: string | null; discipline?: string | null; start_date?: string | null; end_date?: string | null }>;
  employments?: Array<{ id?: number; company_name?: string | null; title?: string | null; start_date?: string | null; end_date?: string | null }>;
  tags?: Array<{ name?: string | null }>;
};

const GREENHOUSE_ORIGIN = "https://harvest.greenhouse.io";
const MAX_CANDIDATES = 5_000;
const MAX_RETRIES = 3;

export class GreenhouseImportError extends Error {}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function profileUrl(candidate: GreenhouseCandidate, kind: "linkedin" | "github"): string {
  const entries = [...(candidate.social_media_addresses ?? []), ...(candidate.website_addresses ?? [])];
  const entry = entries.find((item) => {
    const value = text(item.url ?? item.value).toLowerCase();
    return text(item.type).toLowerCase() === kind || value.includes(`${kind}.com`);
  });
  return entry ? text(entry.url ?? entry.value) : "";
}

function websiteUrl(candidate: GreenhouseCandidate): string {
  const entries = [...(candidate.website_addresses ?? []), ...(candidate.social_media_addresses ?? [])];
  const entry = entries.find((item) => {
    const value = text(item.url ?? item.value).toLowerCase();
    return !value.includes("linkedin.com") && !value.includes("github.com");
  });
  return entry ? text(entry.url ?? entry.value) : "";
}

export function greenhouseCandidateToImportRow(candidate: GreenhouseCandidate, rowNumber: number): GreenhouseCandidateImportRow | null {
  const email = candidate.email_addresses?.map((item) => text(item.value)).find(Boolean) ?? "";
  const firstName = text(candidate.first_name);
  const lastName = text(candidate.last_name);
  if (!email || !firstName || !lastName) return null;

  const company = text(candidate.company);
  const title = text(candidate.title);
  return {
    rowNumber,
    values: {
      firstName,
      lastName,
      email,
      phone: candidate.phone_numbers?.map((item) => text(item.value)).find(Boolean) ?? "",
      location: candidate.addresses?.map((item) => text(item.value)).find(Boolean) ?? "",
      linkedinUrl: profileUrl(candidate, "linkedin"),
      githubUrl: profileUrl(candidate, "github"),
      websiteUrl: websiteUrl(candidate),
      headline: [title, company].filter(Boolean).join(" at "),
      summary: "",
      skills: JSON.stringify((candidate.tags ?? []).map((tag) => text(tag.name)).filter(Boolean).slice(0, 100)),
      educationEntries: JSON.stringify((candidate.educations ?? []).map((education, index) => ({
        id: `greenhouse-education-${candidate.id}-${education.id ?? index}`,
        school: text(education.school_name), degree: text(education.degree) || null,
        field: text(education.discipline) || null, startDate: text(education.start_date) || null,
        endDate: text(education.end_date) || null, description: null,
      })).filter((education) => education.school)),
      experienceEntries: JSON.stringify((candidate.employments ?? []).map((employment, index) => ({
        id: `greenhouse-employment-${candidate.id}-${employment.id ?? index}`,
        company: text(employment.company_name), title: text(employment.title),
        startDate: text(employment.start_date) || null, endDate: text(employment.end_date) || null,
        current: !text(employment.end_date), location: null, description: null,
      })).filter((employment) => employment.company || employment.title)),
    },
  };
}

function nextPage(link: string | null): string | null {
  if (!link) return null;
  const match = link.match(/<([^>]+)>;\s*rel="next"/i);
  if (!match?.[1]) return null;
  const url = new URL(match[1]);
  if (url.origin !== GREENHOUSE_ORIGIN) throw new GreenhouseImportError("Greenhouse returned an unsafe pagination URL.");
  return url.toString();
}

async function request(url: string, token: string, fetchImpl: typeof fetch): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) return response;
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 250 * 2 ** attempt));
      continue;
    }
    if (response.status === 401 || response.status === 403) throw new GreenhouseImportError("Greenhouse rejected the API key or its Candidates permission is missing.");
    throw new GreenhouseImportError(`Greenhouse could not list candidates (HTTP ${response.status}).`);
  }
  throw new GreenhouseImportError("Greenhouse request failed.");
}

/** Fetches a bounded, paginated, read-only candidate export. API keys are never persisted. */
export async function fetchGreenhouseCandidateImportRows(token: string, fetchImpl: typeof fetch = fetch): Promise<{ rows: GreenhouseCandidateImportRow[]; skipped: number }> {
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(token)) throw new GreenhouseImportError("Enter a valid Greenhouse Harvest API key.");
  let url: string | null = `${GREENHOUSE_ORIGIN}/v1/candidates?per_page=500&skip_count=true`;
  let rowNumber = 2;
  let skipped = 0;
  const rows: GreenhouseCandidateImportRow[] = [];
  while (url && rows.length < MAX_CANDIDATES) {
    const response = await request(url, token, fetchImpl);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new GreenhouseImportError("Greenhouse returned an invalid candidate response.");
    for (const candidate of body as GreenhouseCandidate[]) {
      const row = greenhouseCandidateToImportRow(candidate, rowNumber++);
      if (row) rows.push(row); else skipped += 1;
      if (rows.length === MAX_CANDIDATES) break;
    }
    url = nextPage(response.headers.get("link"));
  }
  if (url) throw new GreenhouseImportError(`This import exceeds ${MAX_CANDIDATES.toLocaleString()} eligible candidates. Contact support to run a staged migration.`);
  return { rows, skipped };
}
