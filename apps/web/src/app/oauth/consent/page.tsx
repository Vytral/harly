import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Eye, PencilLine, ShieldAlert, ShieldCheck } from "lucide-react";

import { getAuthBranding } from "@/features/auth/branding.server";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { AuthBrandLockup } from "@/app/(auth)/_components/auth-shell";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { StatusPill } from "@/components/ui/status-pill";
import { validateAuthorizeRequest, type ValidAuthorizeRequest } from "@/lib/mcp/oauth/authorize";
import { CONSENT_BLOCK_MESSAGE_KEYS, evaluateConsentGate, type ConsentBlock } from "@/lib/mcp/oauth/consent";
import { redirectDisplayHost } from "@/lib/mcp/oauth/redirect";
import { describeScopes } from "@/lib/mcp/oauth/scope-labels";
import type { McpScope } from "@/lib/mcp/types";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function toParams(raw: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}

// Query parameters are untrusted. Only recognized error and reason codes map to fixed localized copy.
const REQUEST_REASON_KEYS: Record<string, string> = {
  client_id_missing: "request.client_id_missing", client_unknown: "request.client_unknown",
  client_expired: "request.client_expired", client_blocked: "request.client_blocked",
  client_metadata_unverifiable: "request.client_metadata_unverifiable",
  redirect_uri_missing: "request.redirect_uri_missing", redirect_uri_mismatch: "request.redirect_uri_mismatch",
};
const REQUEST_ERROR_KEYS: Record<string, string> = {
  invalid_client: "request.invalid_client", invalid_request: "request.invalid_request",
};

export default async function ConsentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = toParams(await searchParams);
  const [branding, t] = await Promise.all([getAuthBranding(), getTranslations("oauthConsent")]);
  const msg = (key: string, values?: Record<string, string>) =>
    values ? t(key as never, values as never) : t(key as never);

  let body: React.ReactNode;
  const requestError = params.get("request_error");
  if (requestError) {
    const reason = params.get("request_error_reason");
    body = (
      <MessageCard
        title={msg("request.title")}
        message={
          reason && Object.hasOwn(REQUEST_REASON_KEYS, reason)
            ? msg(REQUEST_REASON_KEYS[reason]!)
            : Object.hasOwn(REQUEST_ERROR_KEYS, requestError)
              ? msg(REQUEST_ERROR_KEYS[requestError]!)
              : msg("request.default")
        }
      />
    );
  } else {
    const validation = await validateAuthorizeRequest(params);
    if (!validation.ok) {
      const errorKey = Object.hasOwn(REQUEST_ERROR_KEYS, validation.error) ? REQUEST_ERROR_KEYS[validation.error]! : "request.default";
      const reasonKey = validation.kind === "page" && Object.hasOwn(REQUEST_REASON_KEYS, validation.reason)
        ? REQUEST_REASON_KEYS[validation.reason]!
        : errorKey;
      body = <MessageCard title={msg("request.title")} message={msg(reasonKey)} />;
    } else {
      const ctx = await getWorkspaceContextOrNull();
      if (!ctx) {
        // Only authorize-validated requests reach the sign-in return path.
        params.delete("request_error");
        redirect(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`);
      }
      const gate = await evaluateConsentGate(ctx, validation.request, await headers());
      body = gate.ok ? (
        <ConsentCard
          request={validation.request}
          query={params.toString()}
          scopes={gate.grantedScopes}
          workspaceName={ctx.organization.name}
          workspaceId={ctx.organization.id}
          userEmail={ctx.user.email}
          msg={msg}
        />
      ) : (
        <BlockedCard block={gate.block} msg={msg} />
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex justify-center px-8 pb-6 pt-10">
        <AuthBrandLockup branding={branding} />
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pb-20 sm:items-center">{body}</main>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-card-enter w-full max-w-[500px]">
      <div className="rounded-2xl border border-hairline bg-pure-snow px-6 py-8 shadow-[0_8px_30px_rgba(23,23,23,0.06)] sm:px-9 sm:py-10">
        {children}
      </div>
    </div>
  );
}

function ClientMark({ name, logoUri }: { name: string; logoUri: string | null }) {
  return (
    <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-card-inset text-[17px] font-semibold text-near-ink ring-1 ring-hairline">
      <span aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "?"}</span>
      {logoUri ? (
        // Third-party image: no referrer, empty alt so a broken logo falls back to the initial.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUri}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full bg-pure-snow object-contain p-1.5"
        />
      ) : null}
    </span>
  );
}

function ConsentCard({
  request,
  query,
  scopes,
  workspaceName,
  workspaceId,
  userEmail,
  msg,
}: {
  request: ValidAuthorizeRequest;
  query: string;
  scopes: McpScope[];
  workspaceName: string;
  workspaceId: string;
  userEmail: string;
  msg: (key: string, values?: Record<string, string>) => string;
}) {
  const { client } = request;
  const described = describeScopes(scopes);
  const reads = described.filter((s) => s.access === "read");
  const writes = described.filter((s) => s.access === "write");
  const host = redirectDisplayHost(request.redirectUri);

  return (
    <Shell>
      <div className="flex items-center gap-3.5">
        <ClientMark name={client.name} logoUri={client.logoUri} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[15px] font-semibold text-near-ink">{client.name}</p>
            {client.known ? (
              <StatusPill size="sm" tone="success">
                <ShieldCheck className="size-3" /> {msg("app.known")}
              </StatusPill>
            ) : (
              <StatusPill size="sm" tone="warning">
                {msg("app.unverified")}
              </StatusPill>
            )}
          </div>
          <p className="truncate text-[12.5px] text-soft-ink">{msg("app.returns", { host } as never)}</p>
        </div>
      </div>

      <h1 className="mt-6 font-display text-[24px] leading-tight tracking-tight text-near-ink">
        {msg("app.allow", { client: client.name, workspace: workspaceName } as never)}
      </h1>
      <p className="mt-1.5 text-sm text-soft-ink">
        {msg("app.signed_in", { email: userEmail } as never)}
      </p>

      {!client.known ? (
        <Callout tone="warning" title={msg("app.unverified")} className="mt-5">
          {msg("app.unverified_warning", { host } as never)}
        </Callout>
      ) : null}

      <div className="mt-6 space-y-5">
        <ScopeGroup icon={<Eye className="size-3.5" />} heading={msg("scope.read")} items={reads} msg={msg} />
        <ScopeGroup icon={<PencilLine className="size-3.5" />} heading={msg("scope.write")} items={writes} msg={msg} />
      </div>

      <p className="mt-6 flex gap-2 text-[12.5px] leading-snug text-soft-ink">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {msg("data_warning", { client: client.name } as never)}
        </span>
      </p>

      <form action="/oauth/consent/decision" method="post" className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <input type="hidden" name="request" value={query} />
        {/* The workspace the person was shown; the decision is refused if the session now points elsewhere. */}
        <input type="hidden" name="workspace" value={workspaceId} />
        <Button type="submit" name="decision" value="deny" variant="outline" size="lg">
          {msg("action.deny")}
        </Button>
        <Button type="submit" name="decision" value="approve" size="lg">
          {msg("action.allow")}
        </Button>
      </form>
    </Shell>
  );
}

function ScopeGroup({
  icon,
  heading,
  items,
  msg,
}: {
  icon: React.ReactNode;
  heading: string;
  items: ReturnType<typeof describeScopes>;
  msg: (key: string, values?: Record<string, string>) => string;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={heading}>
      <h2 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-soft-ink">
        {icon}
        {heading}
      </h2>
      <ul className="divide-y divide-hairline overflow-hidden rounded-xl bg-card-inset">
        {items.map((item) => (
          <li key={item.scope} className="px-4 py-3">
            <p className="text-[13.5px] font-medium text-near-ink">{msg(item.labelKey)}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-soft-ink">{msg(item.descriptionKey)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MessageCard({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <Shell>
      <h1 className="font-display text-[24px] leading-tight tracking-tight text-near-ink">{title}</h1>
      <p className="mt-2 text-sm text-soft-ink">{message}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </Shell>
  );
}

function BlockedCard({ block, msg }: { block: ConsentBlock; msg: (key: string, values?: Record<string, string>) => string }) {
  const copy = CONSENT_BLOCK_MESSAGE_KEYS[block.reason];
  const action =
    block.reason === "needs_2fa" || block.reason === "needs_passkey" ? (
      <Button asChild>
        <Link href="/setup-2fa">{msg("action.security")}</Link>
      </Button>
    ) : block.reason === "must_change_password" ? (
      <Button asChild>
        <Link href="/change-password">{msg("action.password")}</Link>
      </Button>
    ) : undefined;
  return <MessageCard title={msg(copy.title)} message={msg(copy.body)} action={action} />;
}
