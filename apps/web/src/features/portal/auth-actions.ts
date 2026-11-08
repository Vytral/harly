"use server";

import { cookies, headers } from "next/headers";
import { createElement } from "react";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { candidates, db } from "@harly/db";
import {
  PortalPasswordResetEmail,
  portalPasswordResetSubject,
} from "@harly/emails";
import {
  PORTAL_SESSION_COOKIE,
  getSinglePortalWorkspace,
  resolvePortalSession,
  revokeOtherPortalSessions,
  type PortalSession,
} from "@/lib/portal-auth";
import { getPortalAuthMethods } from "@/lib/portal-auth-methods";
import {
  auditPortalEvent,
  consumeOneTimeCode,
  consumeRecoveryCode,
  countRecoveryCodes,
  findActiveCandidateByEmail,
  hasCandidatePassword,
  issueOneTimeCode,
  regenerateRecoveryCodes,
  setCandidatePassword,
  verifyCandidatePassword,
  verifyPasswordLogin,
} from "@/lib/portal-credentials";
import { verifyAgainstDummy, validatePasswordPolicy } from "@/lib/portal-password";
import { currentOriginHash, passesPortalRateLimit } from "@/lib/portal-rate-limit";
import { establishPortalSession } from "@/lib/portal-session";
import { getWorkspaceEmailSender } from "@/lib/email";
import { createLogger } from "@/lib/logger";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

const log = createLogger("portal-auth-actions");

export type PortalAuthResult =
  | { ok: true; redirectTo?: string; recoveryCodes?: string[]; message?: string }
  | { ok: false; error: string };

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";
const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";
const emailSchema = z.string().email().max(254).toLowerCase().trim();
const nameSchema = z.string().trim().min(1).max(80);
const codeSchema = z.string().trim().min(8).max(200);

async function userAgent(): Promise<string | undefined> {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? undefined;
}

function emailKey(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 24);
}

async function requireWorkspace() {
  const workspace = await getSinglePortalWorkspace();
  return workspace;
}

async function currentSession(): Promise<
  { session: PortalSession; rawToken: string } | null
> {
  const rawToken = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  if (!rawToken) return null;
  const session = await resolvePortalSession(rawToken);
  return session ? { session, rawToken } : null;
}

// ---------------------------------------------------------------------------
// Registration and password sign-in
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  email: emailSchema,
  password: z.string().max(256),
  firstName: nameSchema,
  lastName: z.string().trim().max(80).default(""),
});

export async function registerPortalPasswordAction(
  input: z.input<typeof registerSchema>,
): Promise<PortalAuthResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check your name, email and password." };
  }
  const { email, password } = parsed.data;
  const workspace = await requireWorkspace();
  if (!workspace) return { ok: false, error: "This candidate portal is unavailable." };
  const methods = await getPortalAuthMethods(workspace.id);
  if (!methods.password) {
    return { ok: false, error: "Creating an account with a password isn't available." };
  }
  const origin = await currentOriginHash();
  if (
    !(await passesPortalRateLimit(`register:${workspace.id}:${origin}`, [
      { limit: 5, windowMs: 60 * 60_000 },
      { limit: 20, windowMs: 24 * 60 * 60_000 },
    ]))
  ) {
    return { ok: false, error: TOO_MANY };
  }
  const policy = validatePasswordPolicy(password, { email });
  if (!policy.ok) return { ok: false, error: policy.error };

  // Public applications and recruiter imports join candidates by email. An
  // unverified registration could reserve somebody else's email and receive
  // their future applications. Only a proven portal identity may set a password.
  const current = await currentSession();
  if (!current || current.session.workspaceId !== workspace.id || current.session.email.toLowerCase() !== email) {
    return {
      ok: false,
      error:
        "Verify your access first: use a sign-in link or connected account, or ask the company for an access or password setup link.",
    };
  }
  const candidateId = current.session.candidateId;
  if (await hasCandidatePassword(candidateId)) {
    return { ok: false, error: "You already have a password. Change it from your profile." };
  }
  await setCandidatePassword(candidateId, workspace.id, password);
  const recoveryCodes = await regenerateRecoveryCodes(candidateId, workspace.id);
  await establishPortalSession(candidateId, workspace.id, await userAgent());
  await auditPortalEvent({
    workspaceId: workspace.id,
    candidateId,
    email,
    action: "portal.register",
    metadata: { method: "password" },
  });
  return { ok: true, recoveryCodes, redirectTo: "/portal/dashboard" };
}

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
  next: z.string().optional(),
});

export async function loginPortalPasswordAction(
  input: z.input<typeof loginSchema>,
): Promise<PortalAuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_LOGIN_ERROR };
  const { email, password } = parsed.data;
  const workspace = await requireWorkspace();
  if (!workspace) return { ok: false, error: "This candidate portal is unavailable." };
  const methods = await getPortalAuthMethods(workspace.id);
  if (!methods.password) return { ok: false, error: GENERIC_LOGIN_ERROR };

  const origin = await currentOriginHash();
  const allowed =
    (await passesPortalRateLimit(
      `pw:${workspace.id}:${emailKey(email)}:${origin}`,
      [
        { limit: 8, windowMs: 15 * 60_000 },
        { limit: 25, windowMs: 24 * 60 * 60_000 },
      ],
    )) &&
    (await passesPortalRateLimit(`pwip:${workspace.id}:${origin}`, [
      { limit: 60, windowMs: 15 * 60_000 },
    ]));
  if (!allowed) return { ok: false, error: TOO_MANY };

  const result = await verifyPasswordLogin(workspace.id, email, password);
  if (!result) return { ok: false, error: GENERIC_LOGIN_ERROR };

  await establishPortalSession(result.candidateId, workspace.id, await userAgent());
  await auditPortalEvent({
    workspaceId: workspace.id,
    candidateId: result.candidateId,
    email,
    action: "portal.login",
    metadata: { method: "password" },
  });
  return { ok: true, redirectTo: safeNext(parsed.data.next) };
}

function safeNext(next: string | undefined): string {
  if (next && next.startsWith("/portal") && !next.startsWith("//")) return next;
  return "/portal/dashboard";
}

// ---------------------------------------------------------------------------
// Recovery without email
// ---------------------------------------------------------------------------

const recoverSchema = z.object({
  email: emailSchema,
  recoveryCode: z.string().trim().min(8).max(64),
  newPassword: z.string().max(256),
});

export async function recoverPortalPasswordAction(
  input: z.input<typeof recoverSchema>,
): Promise<PortalAuthResult> {
  const parsed = recoverSchema.safeParse(input);
  const invalid = "That email and recovery code don't match.";
  if (!parsed.success) return { ok: false, error: invalid };
  const { email, recoveryCode, newPassword } = parsed.data;
  const workspace = await requireWorkspace();
  if (!workspace) return { ok: false, error: "This candidate portal is unavailable." };
  const methods = await getPortalAuthMethods(workspace.id);
  if (!methods.password) return { ok: false, error: invalid };

  const origin = await currentOriginHash();
  if (
    !(await passesPortalRateLimit(
      `recover:${workspace.id}:${emailKey(email)}:${origin}`,
      [
        { limit: 5, windowMs: 15 * 60_000 },
        { limit: 15, windowMs: 24 * 60 * 60_000 },
      ],
    ))
  ) {
    return { ok: false, error: TOO_MANY };
  }
  const policy = validatePasswordPolicy(newPassword, { email });
  if (!policy.ok) return { ok: false, error: policy.error };

  const candidate = await findActiveCandidateByEmail(workspace.id, email);
  if (!candidate) {
    await verifyAgainstDummy(newPassword);
    return { ok: false, error: invalid };
  }
  if (!(await consumeRecoveryCode(candidate.id, recoveryCode))) {
    return { ok: false, error: invalid };
  }
  await setCandidatePassword(candidate.id, workspace.id, newPassword);
  await revokeOtherPortalSessions(candidate.id);
  await establishPortalSession(candidate.id, workspace.id, await userAgent());
  await auditPortalEvent({
    workspaceId: workspace.id,
    candidateId: candidate.id,
    email,
    action: "portal.password_reset",
    metadata: { via: "recovery_code" },
    severity: "warning",
  });
  const remaining = await countRecoveryCodes(candidate.id);
  return {
    ok: true,
    redirectTo: "/portal/dashboard",
    message:
      remaining <= 2
        ? "Password updated. You are running low on recovery codes: generate new ones from your profile."
        : "Password updated.",
  };
}

// ---------------------------------------------------------------------------
// Access codes and reset links (issued by recruiters; reset also by email)
// ---------------------------------------------------------------------------

export async function redeemPortalAccessCodeAction(input: {
  code: string;
}): Promise<PortalAuthResult> {
  const invalid = "This access code is invalid, expired or already used.";
  const parsed = codeSchema.safeParse(input.code);
  if (!parsed.success) return { ok: false, error: invalid };
  const workspace = await requireWorkspace();
  if (!workspace) return { ok: false, error: "This candidate portal is unavailable." };
  const methods = await getPortalAuthMethods(workspace.id);
  if (!methods.accessCode) return { ok: false, error: invalid };
  const origin = await currentOriginHash();
  if (
    !(await passesPortalRateLimit(`access:${workspace.id}:${origin}`, [
      { limit: 10, windowMs: 15 * 60_000 },
      { limit: 40, windowMs: 24 * 60 * 60_000 },
    ]))
  ) {
    return { ok: false, error: TOO_MANY };
  }
  const result = await consumeOneTimeCode("access", parsed.data, workspace.id);
  if (!result) return { ok: false, error: invalid };
  await establishPortalSession(result.candidateId, workspace.id, await userAgent());
  await auditPortalEvent({
    workspaceId: workspace.id,
    candidateId: result.candidateId,
    action: "portal.login",
    metadata: { method: "access_code" },
  });
  const hasPassword = methods.password
    ? await hasCandidatePassword(result.candidateId)
    : true;
  return {
    ok: true,
    redirectTo: hasPassword ? "/portal/dashboard" : "/portal/profile?setup=password",
  };
}

export async function resetPortalPasswordAction(input: {
  code: string;
  newPassword: string;
}): Promise<PortalAuthResult> {
  const invalid = "This reset link is invalid, expired or already used.";
  const parsed = codeSchema.safeParse(input.code);
  if (!parsed.success) return { ok: false, error: invalid };
  const workspace = await requireWorkspace();
  if (!workspace) return { ok: false, error: "This candidate portal is unavailable." };
  const methods = await getPortalAuthMethods(workspace.id);
  if (!methods.password) return { ok: false, error: invalid };
  const origin = await currentOriginHash();
  if (
    !(await passesPortalRateLimit(`reset:${workspace.id}:${origin}`, [
      { limit: 10, windowMs: 15 * 60_000 },
    ]))
  ) {
    return { ok: false, error: TOO_MANY };
  }
  const policy = validatePasswordPolicy(input.newPassword);
  if (!policy.ok) return { ok: false, error: policy.error };
  const result = await consumeOneTimeCode("reset", parsed.data, workspace.id);
  if (!result) return { ok: false, error: invalid };
  const [cand] = await db
    .select({ email: candidates.email })
    .from(candidates)
    .where(eq(candidates.id, result.candidateId))
    .limit(1);
  await setCandidatePassword(result.candidateId, workspace.id, input.newPassword);
  await revokeOtherPortalSessions(result.candidateId);
  await establishPortalSession(result.candidateId, workspace.id, await userAgent());
  await auditPortalEvent({
    workspaceId: workspace.id,
    candidateId: result.candidateId,
    email: cand?.email,
    action: "portal.password_reset",
    metadata: { via: "reset_link" },
    severity: "warning",
  });
  return { ok: true, redirectTo: "/portal/dashboard" };
}

/** Email reset link. Always answers the same way so it cannot probe accounts. */
export async function requestPortalPasswordResetEmailAction(input: {
  email: string;
}): Promise<PortalAuthResult> {
  const done: PortalAuthResult = {
    ok: true,
    message:
      "If that email has an account, we've sent a link to reset the password.",
  };
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
  const workspace = await requireWorkspace();
  if (!workspace) return { ok: false, error: "This candidate portal is unavailable." };
  const methods = await getPortalAuthMethods(workspace.id);
  if (!methods.password) return done;
  const sender = await getWorkspaceEmailSender(workspace.id).catch(() => null);
  if (!sender) {
    return {
      ok: false,
      error: "Email isn't set up for this portal. Use a recovery code or ask the company for a reset link.",
    };
  }
  const origin = await currentOriginHash();
  if (
    !(await passesPortalRateLimit(
      `resetmail:${workspace.id}:${emailKey(parsed.data)}`,
      [{ limit: 3, windowMs: 60 * 60_000 }],
    )) ||
    !(await passesPortalRateLimit(`resetmailip:${workspace.id}:${origin}`, [
      { limit: 10, windowMs: 60 * 60_000 },
    ]))
  ) {
    return done;
  }
  try {
    const candidate = await findActiveCandidateByEmail(workspace.id, parsed.data);
    if (!candidate) return done;
    const { code } = await issueOneTimeCode({
      candidateId: candidate.id,
      workspaceId: workspace.id,
      kind: "reset",
    });
    const url = `${getHarlyPublicOrigin()}/portal/reset?code=${encodeURIComponent(code)}`;
    await sender.send({
      to: candidate.email,
      subject: portalPasswordResetSubject(),
      react: createElement(PortalPasswordResetEmail, {
        candidateName: candidate.firstName,
        loginUrl: url,
      }),
    });
    await auditPortalEvent({
      workspaceId: workspace.id,
      candidateId: candidate.id,
      email: candidate.email,
      action: "portal.reset_requested",
      metadata: { via: "email" },
    });
  } catch (err) {
    log.error(err, "requestPortalPasswordResetEmailAction failed");
  }
  return done;
}

// ---------------------------------------------------------------------------
// Signed-in security settings
// ---------------------------------------------------------------------------

export async function changePortalPasswordAction(input: {
  currentPassword?: string;
  newPassword: string;
}): Promise<PortalAuthResult> {
  const current = await currentSession();
  if (!current) return { ok: false, error: "Sign in again to continue." };
  const { session, rawToken } = current;
  const methods = await getPortalAuthMethods(session.workspaceId);
  if (!methods.password) {
    return { ok: false, error: "Password sign-in is turned off for this portal." };
  }
  if (
    !(await passesPortalRateLimit(`chg:${session.candidateId}`, [
      { limit: 10, windowMs: 15 * 60_000 },
    ]))
  ) {
    return { ok: false, error: TOO_MANY };
  }
  const policy = validatePasswordPolicy(input.newPassword, { email: session.email });
  if (!policy.ok) return { ok: false, error: policy.error };

  const existing = await hasCandidatePassword(session.candidateId);
  if (existing) {
    if (
      !input.currentPassword ||
      !(await verifyCandidatePassword(session.candidateId, input.currentPassword))
    ) {
      return { ok: false, error: "Your current password is incorrect." };
    }
  }
  await setCandidatePassword(session.candidateId, session.workspaceId, input.newPassword);
  await revokeOtherPortalSessions(session.candidateId, rawToken);
  let recoveryCodes: string[] | undefined;
  if (!existing) {
    recoveryCodes = await regenerateRecoveryCodes(session.candidateId, session.workspaceId);
  }
  await auditPortalEvent({
    workspaceId: session.workspaceId,
    candidateId: session.candidateId,
    email: session.email,
    action: existing ? "portal.password_changed" : "portal.password_set",
  });
  return { ok: true, recoveryCodes, message: "Password updated. Other devices were signed out." };
}

export async function regeneratePortalRecoveryCodesAction(input: {
  password: string;
}): Promise<PortalAuthResult> {
  const current = await currentSession();
  if (!current) return { ok: false, error: "Sign in again to continue." };
  const { session } = current;
  if (!(await hasCandidatePassword(session.candidateId))) {
    return { ok: false, error: "Set a password first." };
  }
  if (
    !(await passesPortalRateLimit(`recgen:${session.candidateId}`, [
      { limit: 5, windowMs: 15 * 60_000 },
    ]))
  ) {
    return { ok: false, error: TOO_MANY };
  }
  if (!(await verifyCandidatePassword(session.candidateId, input.password))) {
    return { ok: false, error: "Your password is incorrect." };
  }
  const recoveryCodes = await regenerateRecoveryCodes(
    session.candidateId,
    session.workspaceId,
  );
  await auditPortalEvent({
    workspaceId: session.workspaceId,
    candidateId: session.candidateId,
    email: session.email,
    action: "portal.recovery_codes_regenerated",
  });
  return { ok: true, recoveryCodes };
}
