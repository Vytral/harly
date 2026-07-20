import { NextResponse, type NextRequest } from "next/server";

import { db, workspaceSettings } from "@harly/db";

import { auth } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { getWorkspaceDocuSignCredentials } from "@/lib/docusign/config";
import {
  exchangeDocuSignCode,
  getDocuSignUserInfo,
} from "@/lib/docusign/client";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { verifyAndConsumeOauthStateNonce } from "@/server/oauth-state";

const log = createLogger("api-docusign-callback");

export const runtime = "nodejs";

/**
 * GET /api/integrations/docusign/callback?code=...&state=...
 *
 * DocuSign redirects here after the user approves OAuth consent.
 * 1. Verify + redeem the server-side nonce (single-use, TTL, actor-bound)
 * 2. Load workspace credentials (DB > env fallback)
 * 3. Exchange the code for access + refresh tokens
 * 4. Fetch userInfo → resolve accountId + REST base URL (baseUri + "/restapi")
 * 5. Encrypt + store tokens, accountId, base URL in workspace_settings
 * 6. Redirect to settings/integrations
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return redirectWithError("Unauthorized. Please log in first.");
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return redirectWithError(`DocuSign denied access: ${error}`);
  }

  if (!code || !state) {
    return redirectWithError("Missing code or state from DocuSign.");
  }

  const workspaceId = session.session.activeOrganizationId;
  if (!workspaceId) {
    return redirectWithError("No workspace available for this account.");
  }
  const nonceCheck = await verifyAndConsumeOauthStateNonce({
    state,
    userId: session.user.id,
    workspaceId,
  });
  if (!nonceCheck.ok) {
    return redirectWithError(`${nonceCheck.error} Please try again.`);
  }

  await requirePermission("integrations:manage");

  const wsId = nonceCheck.workspaceId;

  const credentials = await getWorkspaceDocuSignCredentials(wsId);
  if (!credentials) {
    return redirectWithError(
      "DocuSign credentials not found for this workspace.",
    );
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/integrations/docusign/callback`;

  // Exchange code for tokens.
  const tokenData = await exchangeDocuSignCode({
    authBaseUrl: credentials.authBaseUrl,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    code,
    redirectUri,
  });

  if (!tokenData.access_token || !tokenData.refresh_token) {
    return redirectWithError(
      `Token exchange failed: ${tokenData.error ?? "unknown"} , ${tokenData.error_description ?? ""}`,
    );
  }

  // Resolve accountId + REST base URL from getUserInfo.
  let accountId: string | null = null;
  let restBaseUrl: string | null = null;
  let accountEmail: string | null = null;
  try {
    const userInfo = await getDocuSignUserInfo(
      tokenData.access_token,
      credentials.authBaseUrl,
    );
    accountEmail = userInfo.email ?? null;
    const defaultAccount = userInfo.accounts?.find((a) => a.is_default) ??
      userInfo.accounts?.[0];
    if (defaultAccount?.account_id && defaultAccount?.base_uri) {
      accountId = defaultAccount.account_id;
      // getUserInfo baseUri is the account host (e.g. https://eu.docusign.net);
      // the REST API root is baseUri + "/restapi".
      restBaseUrl = `${defaultAccount.base_uri.replace(/\/$/, "")}/restapi`;
    }
  } catch (err) {
    log.error(err, "Failed to fetch DocuSign userInfo");
  }

  if (!accountId || !restBaseUrl) {
    return redirectWithError(
      "Connected, but could not resolve a DocuSign account. Ensure the user has a default account.",
    );
  }

  const encryptedAccess = encryptSecret(tokenData.access_token);
  const encryptedRefresh = encryptSecret(tokenData.refresh_token);

  const set: Partial<typeof workspaceSettings.$inferInsert> = {
    docusignEnabled: true,
    docusignAccountEmail: accountEmail,
    docusignAccountId: accountId,
    docusignBaseUrl: restBaseUrl,
    docusignAccessTokenCiphertext: encryptedAccess.ciphertext,
    docusignAccessTokenIv: encryptedAccess.iv,
    docusignAccessTokenTag: encryptedAccess.tag,
    docusignRefreshTokenCiphertext: encryptedRefresh.ciphertext,
    docusignRefreshTokenIv: encryptedRefresh.iv,
    docusignRefreshTokenTag: encryptedRefresh.tag,
    updatedAt: new Date(),
  };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: wsId, ...set })
    .onConflictDoUpdate({ target: workspaceSettings.organizationId, set });

  return NextResponse.redirect(
    `${appUrl}/settings/integrations?docusign=connected`,
  );
}

function redirectWithError(msg: string) {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const url = new URL(`${appUrl}/settings/integrations`);
  url.searchParams.set("docusign_error", msg);
  return NextResponse.redirect(url.toString());
}
