import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { db, passkeys, user } from "@harly/db";
import { isDemoMode } from "@harly/config";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { RP_ID, ORIGIN, storeChallenge, consumeChallenge } from "@/lib/passkey";
import { signSessionCookieValue } from "@/lib/session-cookie";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";

const log = createLogger("api-passkey-login");

// Demo lockdown: the public demo mints sessions only through /api/demo/enter
// (Turnstile + server-minted session). Better Auth's /sign-in/passkey is already
// blocked by the demo guard; this hand-rolled route sits outside Better Auth
// and must refuse sign-in itself, for options (GET/legacy POST) and verify.
function demoBlockedResponse(): NextResponse {
  return NextResponse.json(
    { error: "This action is disabled in the demo." },
    { status: 403 },
  );
}

/**
 * The email-scoped legacy mode must not reveal whether an account exists (or
 * how many passkeys it has). Every answer therefore lists at least this many
 * credential IDs: the account's real ones plus deterministic decoys derived
 * from the email with a server secret, sorted by ID so position tells nothing,
 * with transport hints dropped (they are optional hints). Decoys are stable
 * across requests, so repeating the query does not unmask them.
 */
const LEGACY_MIN_ALLOWED_CREDENTIALS = 10;

function decoyCredentialId(secret: string, email: string, index: number) {
  return createHmac("sha256", secret)
    .update(`passkey-legacy-decoy:${email}:${index}`)
    .digest("base64url");
}

async function createLegacyAuthenticationOptions(email: string) {
  const [rows, ctx] = await Promise.all([
    db
      .select({ credentialId: passkeys.credentialId })
      .from(passkeys)
      .innerJoin(user, eq(passkeys.userId, user.id))
      .where(eq(user.email, email)),
    auth.$context,
  ]);

  const ids = rows.map((row) => row.credentialId);
  for (let i = 0; ids.length < LEGACY_MIN_ALLOWED_CREDENTIALS; i += 1) {
    ids.push(decoyCredentialId(ctx.secret, email, i));
  }
  ids.sort();

  return generateOptions(ids.map((id) => ({ id })));
}

async function generateOptions(
  allowCredentials: { id: string; transports?: AuthenticatorTransport[] }[],
) {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
    // No email means username-less/discoverable login (empty list). The
    // email-scoped legacy path exists only to let credentials created before
    // residentKey was required authenticate; it never enumerates credentials
    // belonging to other users.
    allowCredentials,
  });

  const storedChallenge = await storeChallenge(null, options.challenge, "login");
  return { ...options, challengeId: storedChallenge.id };
}

// GET , generate authentication options for passkey login (no session required).
export async function GET(req: NextRequest) {
  if (isDemoMode()) return demoBlockedResponse();
  try {
    await enforceRateLimit(`public:passkey-login:${clientIp(req)}`, {
      limit: 30,
      windowMs: 60_000,
    });
  } catch {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  return NextResponse.json(await generateOptions([]));
}

// POST , verify authentication response and create session for passkey login.
export async function POST(req: NextRequest) {
  if (isDemoMode()) return demoBlockedResponse();
  try {
    await enforceRateLimit(`public:passkey-login:${clientIp(req)}`, {
      limit: 30,
      windowMs: 60_000,
    });
  } catch {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const body = await req.json();

  // Explicit compatibility path for pre-discoverable credentials. Keep the
  // email in the POST body (not the URL); the answer is padded with decoys so
  // it is indistinguishable for unknown accounts.
  if (body.mode === "legacy-options") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    return NextResponse.json(await createLegacyAuthenticationOptions(email));
  }

  // Atomically consume the anonymous login challenge by its unique ID.
  const expectedChallenge = typeof body.challengeId === "string"
    ? await consumeChallenge(body.challengeId, null, "login")
    : null;
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "Challenge expired or not found" },
      { status: 400 },
    );
  }

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
  // better-auth stores this as a SIGNED cookie. Writing the raw token would
  // make getSession reject it, so a successful WebAuthn assertion would still
  // land on the login page.
  response.cookies.set(cookieName, signSessionCookieValue(session.token, ctx.secret), {
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
