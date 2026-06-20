import { NextRequest, NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { eq, and } from "drizzle-orm";
import { db, passkeys } from "@harly/db";
import { auth } from "@/lib/auth";
import { RP_ID, ORIGIN, storeChallenge, consumeChallenge } from "@/lib/passkey";

// GET — generate authentication options for the authenticated user (for re-auth flows).
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userPasskeys = await db
    .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
    .from(passkeys)
    .where(eq(passkeys.userId, session.user.id));

  if (userPasskeys.length === 0) {
    return NextResponse.json({ error: "No passkeys registered" }, { status: 400 });
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
    allowCredentials: userPasskeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports
        ? (JSON.parse(p.transports) as AuthenticatorTransport[])
        : undefined,
    })),
  });

  await storeChallenge(session.user.id, options.challenge, "authentication");

  return NextResponse.json(options);
}

// POST — verify authentication response (used for passkey-as-2FA or re-auth).
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const expectedChallenge = await consumeChallenge(session.user.id, "authentication");
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "Challenge expired or not found" },
      { status: 400 },
    );
  }

  const [storedPasskey] = await db
    .select()
    .from(passkeys)
    .where(
      and(
        eq(passkeys.credentialId, body.id),
        eq(passkeys.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!storedPasskey) {
    return NextResponse.json({ error: "Passkey not found" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: storedPasskey.credentialId,
        publicKey: Buffer.from(storedPasskey.credentialPublicKey, "base64url"),
        counter: storedPasskey.counter,
        transports: storedPasskey.transports
          ? (JSON.parse(storedPasskey.transports) as AuthenticatorTransport[])
          : undefined,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  // Update counter and lastUsedAt.
  await db
    .update(passkeys)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    })
    .where(eq(passkeys.id, storedPasskey.id));

  return NextResponse.json({ verified: true });
}
