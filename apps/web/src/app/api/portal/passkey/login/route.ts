import { NextRequest, NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { and, eq, isNull } from "drizzle-orm";

import { candidatePortalPasskeys, candidates, db } from "@harly/db";
import { getSinglePortalWorkspace } from "@/lib/portal-auth";
import { getPortalAuthMethods } from "@/lib/portal-auth-methods";
import { auditPortalEvent } from "@/lib/portal-credentials";
import {
  PORTAL_ORIGIN,
  PORTAL_RP_ID,
  consumePortalChallenge,
  isSameOrigin,
  storePortalChallenge,
} from "@/lib/portal-passkey";
import { currentOriginHash, passesPortalRateLimit } from "@/lib/portal-rate-limit";
import { establishPortalSession } from "@/lib/portal-session";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
const log = createLogger("api-portal-passkey-login");

async function gate() {
  const workspace = await getSinglePortalWorkspace();
  if (!workspace) return null;
  const methods = await getPortalAuthMethods(workspace.id);
  if (!methods.passkey) return null;
  const origin = await currentOriginHash();
  if (
    !(await passesPortalRateLimit(`pk-login:${workspace.id}:${origin}`, [
      { limit: 30, windowMs: 15 * 60_000 },
    ]))
  ) {
    return "limited" as const;
  }
  return workspace;
}

// GET: discoverable-credential options (no account named, so nothing to enumerate).
export async function GET() {
  const workspace = await gate();
  if (workspace === "limited") {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }
  if (!workspace) return NextResponse.json({ error: "Unavailable" }, { status: 404 });
  const options = await generateAuthenticationOptions({
    rpID: PORTAL_RP_ID,
    userVerification: "preferred",
    allowCredentials: [],
  });
  const challengeId = await storePortalChallenge(
    workspace.id,
    null,
    options.challenge,
    "login",
  );
  return NextResponse.json({ ...options, challengeId });
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const workspace = await gate();
  if (workspace === "limited") {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }
  if (!workspace) return NextResponse.json({ error: "Unavailable" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    challengeId?: unknown;
  } & Record<string, unknown> | null;
  const fail = () => NextResponse.json({ error: "Verification failed" }, { status: 400 });
  if (!body || typeof body.challengeId !== "string" || typeof body.id !== "string") {
    return fail();
  }
  const expectedChallenge = await consumePortalChallenge(
    body.challengeId,
    workspace.id,
    null,
    "login",
  );
  if (!expectedChallenge) return fail();

  const [stored] = await db
    .select()
    .from(candidatePortalPasskeys)
    .where(
      and(
        eq(candidatePortalPasskeys.credentialId, body.id),
        eq(candidatePortalPasskeys.workspaceId, workspace.id),
      ),
    )
    .limit(1);
  if (!stored) return fail();

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body as unknown as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge,
      expectedOrigin: PORTAL_ORIGIN,
      expectedRPID: PORTAL_RP_ID,
      credential: {
        id: stored.credentialId,
        publicKey: Buffer.from(stored.credentialPublicKey, "base64url"),
        counter: stored.counter,
        transports: stored.transports
          ? (JSON.parse(stored.transports) as AuthenticatorTransport[])
          : undefined,
      },
    });
  } catch (error) {
    log.error(error, "portal passkey login failed");
    return fail();
  }
  if (!verification.verified) return fail();

  const [candidate] = await db
    .select({ id: candidates.id, email: candidates.email })
    .from(candidates)
    .where(and(eq(candidates.id, stored.candidateId), isNull(candidates.deletedAt)))
    .limit(1);
  if (!candidate) return fail();

  await db
    .update(candidatePortalPasskeys)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(candidatePortalPasskeys.id, stored.id));
  await establishPortalSession(
    candidate.id,
    workspace.id,
    req.headers.get("user-agent")?.slice(0, 300) ?? undefined,
  );
  await auditPortalEvent({
    workspaceId: workspace.id,
    candidateId: candidate.id,
    email: candidate.email,
    action: "portal.login",
    metadata: { method: "passkey" },
  });
  return NextResponse.json({ verified: true });
}
