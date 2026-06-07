/**
 * Client-safe builder for prefilled Cal.com booking links. No server-only deps
 * so the ScheduleDrawer (client) can build a candidate self-scheduling link.
 *
 * Cal.com booking pages accept `name`, `email` and `metadata[<key>]` query
 * params to prefill the form. We stuff our own ids into metadata so the inbound
 * webhook can resolve the booking back to an application/candidate.
 */

export type CalBookingLinkParams = {
  bookingUrl: string;
  name?: string | null;
  email?: string | null;
  metadata?: Record<string, string>;
};

export function buildCalBookingLink({
  bookingUrl,
  name,
  email,
  metadata,
}: CalBookingLinkParams): string {
  let url: URL;
  try {
    url = new URL(bookingUrl);
  } catch {
    return bookingUrl;
  }

  if (name) url.searchParams.set("name", name);
  if (email) url.searchParams.set("email", email);
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (value) url.searchParams.set(`metadata[${key}]`, value);
  }

  return url.toString();
}
