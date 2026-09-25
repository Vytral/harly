import { NextRequest, NextResponse } from "next/server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { db, passkeys } from "@harly/db";
import { isDemoMode } from "@harly/config";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { RP_ID, RP_NAME, ORIGIN, storeChallenge, consumeChallenge } from "@/lib/passkey";

const log = createLogger("api-passkey-register");

// Demo lockdown, Layer 3: passkey registration is a hand-rolled WebAuthn route
// outside Better Auth, so Layer 1's hook can't reach it. Adding a passkey to the
// shared demo account persists across resets and could gate every future
// visitor behind a credential they don't hold. Refuse both the options (GET) and
// the verify+store (POST) steps in demo mode. Server-side, keyed off DEMO_MODE.
function demoBlockedResponse(): NextResponse {
  return NextResponse.json(
    { error: "This action is disabled in the demo." },
    { status: 403 },
  );
}

// GET , generate registration options for the authenticated user.
export async function GET(req: NextRequest) {
  if (isDemoMode()) {
    return demoBlockedResponse();
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existingPasskeys = await db
    .select({ credentialId: passkeys.credentialId })
    .from(passkeys)
    .where(eq(passkeys.userId, session.user.id));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: session.user.email,
    userDisplayName: session.user.name,
    excludeCredentials: existingPasskeys.map((p) => ({
      id: p.credentialId,
    })),
    authenticatorSelection: {
      // Passwordless login is username-less, so every newly registered
      // credential must be discoverable by the authenticator.
      residentKey: "required",
      userVerification: "preferred",
    },
  });

  const challenge = await storeChallenge(session.user.id, options.challenge, "registration");

  return NextResponse.json({ ...options, challengeId: challenge.id });
}

// POST , verify and store the registration response.
export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    return demoBlockedResponse();
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { response, name } = body;

  const expectedChallenge = typeof body.challengeId === "string"
    ? await consumeChallenge(body.challengeId, session.user.id, "registration")
    : null;
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "Challenge expired or not found" },
      { status: 400 },
    );
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });
  } catch (error) {
    log.error(error, "passkey register verification failed");
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  await db.insert(passkeys).values({
    userId: session.user.id,
    name: name ?? "Passkey",
    credentialId: credential.id,
    credentialPublicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: credential.transports
      ? JSON.stringify(credential.transports)
      : null,
  });

  return NextResponse.json({ verified: true });
}
