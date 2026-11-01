/**
 * Pure helpers for the interviews / offers / documents MCP tools: pagination,
 * deep links, row serialisers, availability slot suggestion and the default
 * signature-field layout. No server imports so they are unit-testable.
 */

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

export function clampLimit(limit: number | undefined, fallback = DEFAULT_LIMIT, max = MAX_LIMIT): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(Math.trunc(limit), 1), max);
}

/** Absolute deep link into the Harly web app. */
export function appLink(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export const candidateLink = (origin: string, candidateId: string) =>
  appLink(origin, `/dashboard/candidates/${candidateId}`);
export const documentLink = (origin: string, documentId: string) =>
  appLink(origin, `/dashboard/documents/${documentId}`);
export const documentDownloadLink = (origin: string, documentId: string) =>
  appLink(origin, `/api/documents/${documentId}?download=1`);

export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Page of rows fetched with `limit + 1`: trims the probe row and reports `hasMore`. */
export function paginate<T>(rows: T[], limit: number, offset: number) {
  const hasMore = rows.length > limit;
  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    pagination: { limit, offset, hasMore, nextOffset: hasMore ? offset + limit : null },
  };
}

export type InterviewRow = {
  id: string;
  applicationId: string;
  candidateId: string;
  candidateName: string;
  jobId: string;
  jobTitle: string;
  interviewerId: string | null;
  interviewerName: string | null;
  title: string | null;
  type: string;
  mode: string;
  status: string;
  scheduledAt: Date;
  durationMins: number;
  location: string | null;
  meetLink: string | null;
  notes: string | null;
  gcalEventId?: string | null;
  teamsMeetingId?: string | null;
  zoomMeetingId?: string | null;
  jitsiRoom?: string | null;
};

/** Which connected calendar / meeting provider holds the event for an interview. */
export function interviewProviders(row: Pick<InterviewRow, "gcalEventId" | "teamsMeetingId" | "zoomMeetingId" | "jitsiRoom">): string[] {
  const providers: string[] = [];
  if (row.gcalEventId) providers.push("google_calendar");
  if (row.teamsMeetingId) providers.push("microsoft_teams");
  if (row.zoomMeetingId) providers.push("zoom");
  if (row.jitsiRoom) providers.push("jitsi");
  return providers;
}

export function serializeInterviewRow(row: InterviewRow, origin: string) {
  const start = row.scheduledAt;
  return {
    id: row.id,
    status: row.status,
    type: row.type,
    mode: row.mode,
    title: row.title,
    scheduledAt: start.toISOString(),
    endsAt: new Date(start.getTime() + row.durationMins * 60_000).toISOString(),
    durationMins: row.durationMins,
    location: row.location,
    meetingUrl: row.meetLink,
    providers: interviewProviders(row),
    candidate: { id: row.candidateId, name: row.candidateName },
    job: { id: row.jobId, title: row.jobTitle },
    applicationId: row.applicationId,
    interviewer: row.interviewerId ? { id: row.interviewerId, name: row.interviewerName } : null,
    url: candidateLink(origin, row.candidateId),
  };
}

export type OfferRow = {
  id: string;
  applicationId: string;
  candidateId: string;
  candidateName: string;
  jobId: string;
  jobTitle: string;
  status: string;
  title: string;
  salaryAmount: number | null;
  currency: string | null;
  salaryPeriod: string | null;
  equity: string | null;
  startDate: Date | null;
  expiresAt: Date | null;
  notes: string | null;
  createdByName: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeOfferRow(row: OfferRow, origin: string) {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    salaryAmount: row.salaryAmount,
    currency: row.currency,
    salaryPeriod: row.salaryPeriod,
    equity: row.equity,
    startDate: toIso(row.startDate),
    expiresAt: toIso(row.expiresAt),
    notes: row.notes,
    candidate: { id: row.candidateId, name: row.candidateName },
    job: { id: row.jobId, title: row.jobTitle },
    applicationId: row.applicationId,
    createdBy: row.createdByName,
    decidedAt: toIso(row.decidedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    url: candidateLink(origin, row.candidateId),
  };
}

/**
 * Result of a native signing-link creation reduced to what a recruiter may see.
 * The raw `signingUrl` is a bearer link meant only for the signer, so it is
 * dropped here and never reaches the MCP client.
 */
export function redactSigningResult(result: unknown): {
  envelopeId?: string;
  recipientId?: string;
  reused?: boolean;
  expiresAt?: string | null;
} {
  if (!result || typeof result !== "object") return {};
  const r = result as Record<string, unknown>;
  return {
    envelopeId: typeof r.envelopeId === "string" ? r.envelopeId : undefined,
    recipientId: typeof r.recipientId === "string" ? r.recipientId : undefined,
    reused: typeof r.reused === "boolean" ? r.reused : undefined,
    expiresAt: r.expiresAt instanceof Date ? r.expiresAt.toISOString() : typeof r.expiresAt === "string" ? r.expiresAt : undefined,
  };
}

export type SignatureFieldInput = {
  type: "signature" | "text" | "date";
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string | null;
  required: boolean;
  order: number;
  recipientIndex: number;
};

/**
 * One required signature box per signer, stacked at the bottom of the last
 * page. Used when the caller asks for automatic placement instead of exact
 * coordinates. Coordinates are fractions of the page (0..1).
 */
export function defaultSignatureFields(pageCount: number, signerCount: number): SignatureFieldInput[] {
  const page = Math.max(1, Math.trunc(pageCount));
  const count = Math.min(Math.max(Math.trunc(signerCount), 1), 10);
  return Array.from({ length: count }, (_, index) => ({
    type: "signature" as const,
    page,
    x: 0.08,
    y: Number((0.14 + index * 0.075).toFixed(3)),
    w: 0.4,
    h: 0.06,
    label: count > 1 ? `Signature ${index + 1}` : "Signature",
    required: true,
    order: index,
    recipientIndex: index,
  }));
}

// ---------------------------------------------------------------------------
// Availability: turn busy blocks into suggested interview slots.
// ---------------------------------------------------------------------------

export type BusyBlock = { start: Date; end: Date };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local calendar day, minutes since local midnight and weekday (0 = Sunday) in a zone. */
export function localParts(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    zoneFormatter(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export type SuggestSlotsInput = {
  rangeStart: Date;
  rangeEnd: Date;
  durationMins: number;
  busy: BusyBlock[];
  timeZone: string;
  /** Local working hours, e.g. 9 to 17. */
  workdayStartHour?: number;
  workdayEndHour?: number;
  /** 0 = Sunday ... 6 = Saturday. Defaults to Monday to Friday. */
  workDays?: number[];
  stepMins?: number;
  maxSlots?: number;
  maxPerDay?: number;
  now?: Date;
};

/**
 * Candidate interview slots inside working hours that do not overlap any busy
 * block. Steps through the range in `stepMins` increments; at most `maxPerDay`
 * per local day so the options span several days rather than clustering.
 */
export function suggestSlots(input: SuggestSlotsInput): Array<{ start: string; end: string; localDate: string; localStart: string }> {
  const step = Math.max(5, input.stepMins ?? 30);
  const dayStart = (input.workdayStartHour ?? 9) * 60;
  const dayEnd = (input.workdayEndHour ?? 17) * 60;
  const workDays = new Set(input.workDays ?? [1, 2, 3, 4, 5]);
  const maxSlots = input.maxSlots ?? 12;
  const maxPerDay = input.maxPerDay ?? 3;
  const earliest = Math.max(input.rangeStart.getTime(), (input.now ?? new Date()).getTime());
  const stepMs = step * 60_000;
  const durationMs = input.durationMins * 60_000;
  const busy = [...input.busy].sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: Array<{ start: string; end: string; localDate: string; localStart: string }> = [];
  const perDay = new Map<string, number>();
  for (let t = Math.ceil(earliest / stepMs) * stepMs; t + durationMs <= input.rangeEnd.getTime(); t += stepMs) {
    if (slots.length >= maxSlots) break;
    const start = new Date(t);
    const end = new Date(t + durationMs);
    const from = localParts(start, input.timeZone);
    const to = localParts(end, input.timeZone);
    if (!workDays.has(from.weekday)) continue;
    if (from.dateKey !== to.dateKey && to.minutes !== 0) continue;
    if (from.minutes < dayStart) continue;
    const endMinutes = from.dateKey === to.dateKey ? to.minutes : 24 * 60;
    if (endMinutes > dayEnd) continue;
    if (busy.some((block) => block.start.getTime() < end.getTime() && block.end.getTime() > start.getTime())) continue;
    if ((perDay.get(from.dateKey) ?? 0) >= maxPerDay) continue;
    perDay.set(from.dateKey, (perDay.get(from.dateKey) ?? 0) + 1);
    const hh = String(Math.floor(from.minutes / 60)).padStart(2, "0");
    const mm = String(from.minutes % 60).padStart(2, "0");
    slots.push({ start: start.toISOString(), end: end.toISOString(), localDate: from.dateKey, localStart: `${hh}:${mm}` });
  }
  return slots;
}

/** Decode a base64 payload (optionally a data URL) and enforce a byte limit. */
export function decodeBase64Payload(
  value: string,
  maxBytes: number,
): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  const raw = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  if (!/^[A-Za-z0-9+/=\s_-]+$/.test(raw)) return { ok: false, error: "contentBase64 is not valid base64." };
  const bytes = Buffer.from(raw.replace(/\s+/g, ""), "base64");
  if (bytes.byteLength === 0) return { ok: false, error: "The file is empty." };
  if (bytes.byteLength > maxBytes) {
    return { ok: false, error: `The file is ${bytes.byteLength} bytes; the limit is ${maxBytes} bytes.` };
  }
  return { ok: true, bytes };
}
