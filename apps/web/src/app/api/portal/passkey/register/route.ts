import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { eq } from "drizzle-orm";

import { candidatePortalPasskeys, db } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { getPortalAuthMethods } from "@/lib/portal-auth-methods";
import { auditPortalEvent } from "@/lib/portal-credentials";
import {
  PORTAL_ORIGIN,
  PORTAL_RP_ID,
  PORTAL_RP_NAME,
  consumePortalChallenge,
  isSameOrigin,
  storePortalChallenge,
} from "@/lib/portal-passkey";
import { passesPortalRateLimit } from "@/lib/portal-rate-limit";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
const log = createLogger("api-portal-passkey-register");
const MAX_PASSKEYS = 10;

async function sessionOrNull() {
  const raw = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  return raw ? resolvePortalSession(raw) : null;
}

// GET: registration options for the signed-in candidate.
export async function GET() {
  const session = await sessionOrNull();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const methods = await getPortalAuthMethods(session.workspaceId);
  if (!methods.passkey) {
    return NextResponse.json({ error: "Passkeys are not enabled." }, { status: 404 });
  }
  if (
    !(await passesPortalRateLimit(`pk-reg:${session.candidateId}`, [
      { limit: 20, windowMs: 15 * 60_000 },
    ]))
  ) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }
  const existing = await db
    .select({ credentialId: candidatePortalPasskeys.credentialId })
    .from(candidatePortalPasskeys)
    .where(eq(candidatePortalPasskeys.candidateId, session.candidateId));
  if (existing.length >= MAX_PASSKEYS) {
    return NextResponse.json({ error: "Passkey limit reached." }, { status: 400 });
  }
  const options = await generateRegistrationOptions({
    rpName: PORTAL_RP_NAME,
    rpID: PORTAL_RP_ID,
    userName: session.email,
    userDisplayName: `${session.firstName} ${session.lastName}`.trim() || session.email,
    userID: new Uint8Array(Buffer.from(session.candidateId)),
    excludeCredentials: existing.map((p) => ({ id: p.credentialId })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  const challengeId = await storePortalChallenge(
    session.workspaceId,
    session.candidateId,
    options.challenge,
    "registration",
  );
  return NextResponse.json({ ...options, challengeId });
}

// POST: verify and store the new credential.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await sessionOrNull();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const methods = await getPortalAuthMethods(session.workspaceId);
  if (!methods.passkey) {
    return NextResponse.json({ error: "Passkeys are not enabled." }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as {
    response?: unknown;
    challengeId?: unknown;
    name?: unknown;
  } | null;
  if (!body || typeof body.challengeId !== "string" || !body.response) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const expectedChallenge = await consumePortalChallenge(
    body.challengeId,
    session.workspaceId,
    session.candidateId,
    "registration",
  );
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Challenge expired or not found" }, { status: 400 });
  }
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
      expectedChallenge,
      expectedOrigin: PORTAL_ORIGIN,
      expectedRPID: PORTAL_RP_ID,
    });
  } catch (error) {
    log.error(error, "portal passkey registration failed");
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }
  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }
  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 60)
      : "Passkey";
  await db.insert(candidatePortalPasskeys).values({
    candidateId: session.candidateId,
    workspaceId: session.workspaceId,
    name,
    credentialId: credential.id,
    credentialPublicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: credential.transports ? JSON.stringify(credential.transports) : null,
  });
  await auditPortalEvent({
    workspaceId: session.workspaceId,
    candidateId: session.candidateId,
    email: session.email,
    action: "portal.passkey_added",
  });
  return NextResponse.json({ verified: true });
}
