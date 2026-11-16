import { NextResponse, type NextRequest } from "next/server";

import { InboundPayloadError, postmarkAdapter, resendAdapter } from "@harly/emails";
import type { InboundEmailAdapter, InboundProviderId } from "@harly/emails";

import { getWorkspaceInboundEmailConfig } from "@/lib/email/config";
import { processInboundEmail } from "@/lib/email/inbound-processor";
import { createLogger } from "@/lib/logger";

const log = createLogger("api-inbound-email-webhook");

export const runtime = "nodejs";

const ADAPTERS: Record<InboundProviderId, InboundEmailAdapter> = {
  postmark: postmarkAdapter,
  resend: resendAdapter,
};

/**
 * Largest webhook body read into memory. Postmark inlines attachments as
 * base64, so this sits above the 25 MB attachment cap, and far below what an
 * unauthenticated caller could otherwise make the server buffer.
 */
const MAX_INBOUND_WEBHOOK_BYTES = 40 * 1024 * 1024;

class BodyTooLargeError extends Error {}

/** Read the body as text, giving up as soon as it passes `limit` bytes. */
async function readBodyWithLimit(request: NextRequest, limit: number): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new BodyTooLargeError();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function isInboundProviderId(value: string): value is InboundProviderId {
  return value === "postmark" || value === "resend";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const workspaceId = request.nextUrl.searchParams.get("ws");
  if (!workspaceId) {
    return NextResponse.json({ error: "Missing workspace." }, { status: 400 });
  }
  if (!isInboundProviderId(provider)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }

  // Raw body is required for signature verification, read it as text first,
  // but never more than the cap (checked before and while reading).
  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(request, MAX_INBOUND_WEBHOOK_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }
    log.error(error, "could not read inbound email webhook body");
    return NextResponse.json({ error: "Could not read request." }, { status: 400 });
  }

  // An unknown workspace, a workspace without inbound email and a wrong
  // signature all answer identically, so this endpoint does not reveal which
  // workspace ids exist.
  const rejected = () => NextResponse.json({ error: "Invalid signature." }, { status: 401 });

  let config: Awaited<ReturnType<typeof getWorkspaceInboundEmailConfig>>;
  try {
    config = await getWorkspaceInboundEmailConfig(workspaceId);
  } catch (error) {
    log.error(error, "inbound email config lookup failed");
    return NextResponse.json({ error: "Temporarily unavailable." }, { status: 503 });
  }
  if (!config || config.provider !== provider) return rejected();

  const adapter = ADAPTERS[provider];
  if (!adapter.verifySignature(rawBody, request.headers, config.webhookSecret)) {
    return rejected();
  }

  let email: Awaited<ReturnType<InboundEmailAdapter["parse"]>>;
  try {
    email = await adapter.parse(rawBody, {
      apiKey: config.resendApiKey,
      warn: (message, meta) => log.warn({ ...meta, workspaceId }, message),
    });
  } catch (error) {
    if (error instanceof InboundPayloadError || error instanceof SyntaxError) {
      // The payload itself is unusable; a retry would fail the same way.
      log.warn({ error: error.message }, "inbound email payload rejected");
      return NextResponse.json({ error: "Could not process email." }, { status: 400 });
    }
    // Follow-up provider calls failed: ask the provider to deliver again.
    log.error(error, "inbound email could not be fetched from the provider");
    return NextResponse.json({ error: "Temporarily unavailable." }, { status: 502 });
  }

  try {
    await processInboundEmail(email, workspaceId);
  } catch (error) {
    // Storage or database trouble is transient; processing is idempotent on
    // the Message-ID, so a redelivery is safe.
    log.error(error, "inbound email processing failed");
    return NextResponse.json({ error: "Temporarily unavailable." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
