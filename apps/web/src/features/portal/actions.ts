"use server";

import { cookies } from "next/headers";
import { createElement } from "react";
import { z } from "zod";

import {
  PortalMagicLinkEmail,
  createEmailSender,
  portalMagicLinkSubject,
} from "@harly/emails";
import {
  PORTAL_SESSION_COOKIE,
  createMagicLinkToken,
  deletePortalSession,
  getPortalWorkspaceId,
  isPortalEnabled,
} from "@/lib/portal-auth";

const emailSchema = z.string().email().max(254).toLowerCase().trim();

export type SendMagicLinkResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendPortalMagicLinkAction(
  email: string,
): Promise<SendMagicLinkResult> {
  if (!(await isPortalEnabled())) {
    return { ok: false, error: "Candidate portal is not enabled." };
  }

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const workspaceId = await getPortalWorkspaceId();
  if (!workspaceId) {
    return { ok: false, error: "Workspace not found." };
  }

  try {
    const token = await createMagicLinkToken(workspaceId, parsed.data);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const url = `${appUrl}/api/portal/auth/magic?token=${token}`;

    const sender = createEmailSender();
    if (sender) {
      await sender.send({
        to: parsed.data,
        subject: portalMagicLinkSubject(),
        react: createElement(PortalMagicLinkEmail, { loginUrl: url }),
      });
    } else {
      console.log(`[Portal magic link] ${parsed.data}: ${url}`);
    }

    return { ok: true };
  } catch (err) {
    console.error("sendPortalMagicLinkAction error:", err);
    return { ok: false, error: "Could not send the sign-in link. Try again." };
  }
}

export async function signOutPortalAction(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (raw) {
    await deletePortalSession(raw);
    cookieStore.delete(PORTAL_SESSION_COOKIE);
  }
}
