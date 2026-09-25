import { NextResponse, type NextRequest } from "next/server";

import { dispatchWorkflowEvent } from "@/features/automations/dispatch";
import { receiveWorkflowWebhook } from "@/features/automations/webhook-ingress";
import { assertNotDemo, DemoActionDisabledError } from "@/features/demo/assert-not-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

async function readBoundedBody(request: NextRequest): Promise<
  | { ok: true; rawBody: string }
  | { ok: false; status: 400 | 413; error: string }
> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && BigInt(contentLength) > BigInt(MAX_BODY_BYTES)) {
    return { ok: false, status: 413, error: "Webhook payload is too large." };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: true, rawBody: "" };

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413, error: "Webhook payload is too large." };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, status: 400, error: "Webhook request body could not be read." };
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, rawBody: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) };
  } catch {
    return { ok: false, status: 400, error: "Webhook payload must use valid UTF-8." };
  }
}

/**
 * Public inbound workflow trigger. The endpoint token is only a locator
 * capability; every request also needs a recent HMAC over
 * `timestamp.eventId.rawBody` (the event-id segment is empty when omitted).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ endpointId: string; token: string }> },
) {
  try {
    assertNotDemo();
  } catch (error) {
    if (error instanceof DemoActionDisabledError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 403 });
    }
    throw error;
  }
  const { endpointId, token } = await params;
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json" && !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType ?? "")) {
    return NextResponse.json({ error: "Content-Type must be application/json or application/*+json." }, { status: 415 });
  }
  const body = await readBoundedBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const result = await receiveWorkflowWebhook({
    endpointId,
    token,
    rawBody: body.rawBody,
    signature: request.headers.get("x-harly-signature") ?? request.headers.get("x-signature"),
    timestamp: request.headers.get("x-harly-timestamp") ?? request.headers.get("x-timestamp"),
    externalEventId:
      request.headers.get("x-event-id") ??
      request.headers.get("x-external-event-id") ??
      request.headers.get("idempotency-key"),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (!result.duplicate) {
    // The receipt + domain outbox are already committed. This dispatch is an
    // accelerator only; the domain-events/automations cron can replay it.
    void Promise.resolve(dispatchWorkflowEvent(result.workspaceId, "webhook.received", result.payload, {
      sourceEventId: result.eventId,
    })).catch(() => {
      // The committed domain outbox remains the durable retry path.
    });
  }

  return NextResponse.json(
    { ok: true, accepted: true, duplicate: result.duplicate, eventId: result.eventId },
    { status: result.duplicate ? 200 : 202 },
  );
}
