import { NextResponse, type NextRequest } from "next/server";

import { postmarkAdapter, resendAdapter } from "@harly/emails";
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

  // Raw body is required for signature verification — read it as text first.
  const rawBody = await request.text();

  const config = await getWorkspaceInboundEmailConfig(workspaceId);
  if (!config || config.provider !== provider) {
    return NextResponse.json({ error: "Inbound email not configured." }, { status: 404 });
  }

  const adapter = ADAPTERS[provider];
  if (!adapter.verifySignature(rawBody, request.headers, config.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  try {
    const email = await adapter.parse(rawBody, { apiKey: config.resendApiKey });
    await processInboundEmail(email, workspaceId);
  } catch (error) {
    log.error(error, "inbound email processing failed");
    return NextResponse.json({ error: "Could not process email." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
