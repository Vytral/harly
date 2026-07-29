import { NextRequest, NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { db, passkeys } from "@harly/db";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { RP_ID, ORIGIN } from "@/lib/passkey";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";

const log = createLogger("api-passkey-login");

// In-memory challenge store for passkey login (short-lived, 5 min TTL).
// We can't use the existing passkeyChallenge table because it requires a userId,
// but for passkey login we don't know the user until after verification.
const loginChallenges = new Map<string, { challenge: string; expiresAt: number }>();

// Clean up expired challenges periodically.
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of loginChallenges.entries()) {
    if (value.expiresAt < now) {
      loginChallenges.delete(key);
    }
  }
}, 60_000);

// GET , generate authentication options for passkey login (no session required).
export async function GET(req: NextRequest) {
  try {
    await enforceRateLimit(`public:passkey-login:${clientIp(req)}`, {
      limit: 30,
      windowMs: 60_000,
    });
  } catch {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  // Get all passkeys to allow the browser to check if any are available.
  const allPasskeys = await db
    .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
    .from(passkeys);

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
    allowCredentials: allPasskeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports
        ? (JSON.parse(p.transports) as AuthenticatorTransport[])
        : undefined,
    })),
  });

  // Generate a unique challenge ID and store the challenge.
  const challengeId = crypto.randomUUID();
  loginChallenges.set(challengeId, {
    challenge: options.challenge,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });

  // Return options with the challenge ID for the client to send back.
  return NextResponse.json({ ...options, challengeId });
}

// POST , verify authentication response and create session for passkey login.
export async function POST(req: NextRequest) {
  try {
    await enforceRateLimit(`public:passkey-login:${clientIp(req)}`, {
      limit: 30,
      windowMs: 60_000,
    });
  } catch {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const body = await req.json();

  // Get and consume the challenge using the challenge ID.
  const storedChallenge = loginChallenges.get(body.challengeId);
  if (!storedChallenge || storedChallenge.expiresAt < Date.now()) {
    loginChallenges.delete(body.challengeId);
    return NextResponse.json(
      { error: "Challenge expired or not found" },
      { status: 400 },
    );
  }
  loginChallenges.delete(body.challengeId);

  const expectedChallenge = storedChallenge.challenge;

  // Find the passkey by credential ID.
  const [storedPasskey] = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.credentialId, body.id))
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
  } catch (error) {
    log.error(error, "passkey login verification failed");
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

  // Create a session using better-auth's internal adapter.
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(storedPasskey.userId);

  if (!session) {
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 },
    );
  }

  // Get the user data.
  const user = await ctx.internalAdapter.findUserById(storedPasskey.userId);
  if (!user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 400 },
    );
  }

  // Set session cookie manually.
  // The session token is already issued in the HTTP-only cookie below. Never
  // return it in the response body: doing so exposes a bearer credential to
  // page JavaScript, browser extensions, logs, and any intermediary that
  // records response bodies.
  const response = NextResponse.json({ verified: true });

  // Get cookie configuration from auth context.
  const cookieName = ctx.authCookies.sessionToken.name;
  const cookieAttributes = ctx.authCookies.sessionToken.attributes;

  // Set the session token cookie.
  response.cookies.set(cookieName, session.token, {
    maxAge: ctx.sessionConfig.expiresIn,
    path: cookieAttributes.path || "/",
    httpOnly: (cookieAttributes as Record<string, unknown>).httponly as boolean || cookieAttributes.httpOnly,
    secure: cookieAttributes.secure,
    sameSite: ((cookieAttributes as Record<string, unknown>).samesite as "lax" | "strict" | "none") || "lax",
  });

  // Set session data cache if enabled.
  if (ctx.options.session?.cookieCache?.enabled) {
    const sessionData = {
      session: { ...session, expiresAt: session.expiresAt.toISOString() },
      user: { id: user.id, email: user.email, name: user.name, image: user.image },
      updatedAt: Date.now(),
    };
    const dataCookieName = ctx.authCookies.sessionData.name;
    const dataCookieAttributes = ctx.authCookies.sessionData.attributes;
    response.cookies.set(dataCookieName, btoa(JSON.stringify(sessionData)), {
      maxAge: ctx.options.session.cookieCache.maxAge || 300,
      path: dataCookieAttributes.path || "/",
      httpOnly: (dataCookieAttributes as Record<string, unknown>).httponly as boolean || dataCookieAttributes.httpOnly,
      secure: dataCookieAttributes.secure,
      sameSite: ((dataCookieAttributes as Record<string, unknown>).samesite as "lax" | "strict" | "none") || "lax",
    });
  }

  return response;
}
