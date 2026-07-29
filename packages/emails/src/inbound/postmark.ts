import { timingSafeEqual } from "node:crypto";

import type { CanonicalInboundEmail, InboundEmailAdapter } from "./types";

type PostmarkHeader = { Name: string; Value: string };

type PostmarkAttachment = {
  Name: string;
  Content: string; // base64
  ContentType: string;
  ContentLength: number;
};

type PostmarkInboundPayload = {
  MessageID: string;
  From: string;
  ToFull?: { Email: string }[];
  To?: string;
  Subject: string;
  TextBody?: string;
  HtmlBody?: string;
  Headers?: PostmarkHeader[];
  Attachments?: PostmarkAttachment[];
  Date?: string;
};

function findHeader(headers: PostmarkHeader[] | undefined, name: string) {
  return headers?.find((h) => h.Name.toLowerCase() === name.toLowerCase())
    ?.Value;
}

function parseReferences(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const ids = value.split(/\s+/).filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

/**
 * Postmark has no HMAC signature scheme for inbound webhooks — the
 * recommended security model is Basic Auth embedded in the webhook URL
 * itself (checked against the workspace's stored secret).
 */
function verifySignature(
  _rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  const auth = headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  const password = separator >= 0 ? decoded.slice(separator + 1) : "";
  if (!password || !secret) return false;
  const actual = Buffer.from(password);
  const expected = Buffer.from(secret);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

async function parse(rawBody: string): Promise<CanonicalInboundEmail> {
  const payload = JSON.parse(rawBody) as PostmarkInboundPayload;

  return {
    messageId: payload.MessageID,
    inReplyTo: findHeader(payload.Headers, "In-Reply-To"),
    references: parseReferences(findHeader(payload.Headers, "References")),
    from: payload.From,
    to: payload.ToFull?.map((t) => t.Email) ?? (payload.To ? [payload.To] : []),
    subject: payload.Subject,
    textBody: payload.TextBody ?? "",
    htmlBody: payload.HtmlBody,
    attachments: (payload.Attachments ?? []).map((a) => ({
      filename: a.Name,
      contentType: a.ContentType,
      content: Buffer.from(a.Content, "base64"),
    })),
    receivedAt: payload.Date ? new Date(payload.Date) : new Date(),
  };
}

export const postmarkAdapter: InboundEmailAdapter = {
  provider: "postmark",
  verifySignature,
  parse,
};
