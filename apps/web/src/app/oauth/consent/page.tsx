import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Eye, PencilLine, ShieldAlert, ShieldCheck } from "lucide-react";

import { getAuthBranding } from "@/features/auth/branding.server";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { AuthBrandLockup } from "@/app/(auth)/_components/auth-shell";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { StatusPill } from "@/components/ui/status-pill";
import { validateAuthorizeRequest, type ValidAuthorizeRequest } from "@/lib/mcp/oauth/authorize";
import { CONSENT_BLOCK_COPY, evaluateConsentGate, type ConsentBlock } from "@/lib/mcp/oauth/consent";
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

// The error code arrives in the URL, which anyone can craft, so only fixed copy
// is ever rendered here. Never echo a query-supplied description on this page.
const DEFAULT_REQUEST_ERROR = "The application's request was not valid.";
const REQUEST_ERROR_COPY: Record<string, string> = {
  invalid_client: "This application is not registered or its metadata could not be verified.",
  invalid_request: "The application's request is incomplete, or its redirect address does not match its registration.",
};

const REQUEST_ERROR_REASON_COPY: Record<string, string> = {
  client_id_missing: "The application did not say who it is (client_id is missing).",
  client_unknown:
    "This application is not registered with this Harly instance. In the app, remove the Harly connection and add it again so it registers itself. If it keeps failing, check that Settings > AI agents > Allow automatic app registration is on.",
  client_expired: "This application's registration expired. In the app, remove the Harly connection and add it again.",
  client_blocked: "An administrator has blocked this application.",
  client_metadata_unverifiable: "This application's client metadata document could not be fetched or verified.",
  redirect_uri_missing: "The application did not say where to return after sign-in (redirect_uri is missing).",
  redirect_uri_mismatch:
    "The address this application wants to return to does not match the one it registered. Remove the Harly connection in the app and add it again.",
};

export default async function ConsentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = toParams(await searchParams);
  const branding = await getAuthBranding();

  let body: React.ReactNode;
  const requestError = params.get("request_error");
  if (requestError) {
    const reason = params.get("request_error_reason");
    body = (
      <MessageCard
        title="This request can't be completed"
        message={
          reason && Object.hasOwn(REQUEST_ERROR_REASON_COPY, reason)
            ? REQUEST_ERROR_REASON_COPY[reason]!
            : Object.hasOwn(REQUEST_ERROR_COPY, requestError)
              ? REQUEST_ERROR_COPY[requestError]!
              : DEFAULT_REQUEST_ERROR
        }
      />
    );
  } else {
    const validation = await validateAuthorizeRequest(params);
    if (!validation.ok) {
      body = <MessageCard title="This request can't be completed" message={validation.description} />;
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
        />
      ) : (
        <BlockedCard block={gate.block} />
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
}: {
  request: ValidAuthorizeRequest;
  query: string;
  scopes: McpScope[];
  workspaceName: string;
  workspaceId: string;
  userEmail: string;
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
                <ShieldCheck className="size-3" /> Known app
              </StatusPill>
            ) : (
              <StatusPill size="sm" tone="warning">
                Unverified app
              </StatusPill>
            )}
          </div>
          <p className="truncate text-[12.5px] text-soft-ink">Returns to {host}</p>
        </div>
      </div>

      <h1 className="mt-6 font-display text-[24px] leading-tight tracking-tight text-near-ink">
        Allow {client.name} to use {workspaceName}?
      </h1>
      <p className="mt-1.5 text-sm text-soft-ink">
        Signed in as <span className="font-medium text-near-ink">{userEmail}</span>. The app acts as you and can only
        do what your role in Harly allows.
      </p>

      {!client.known ? (
        <Callout tone="warning" title="Unverified app" className="mt-5">
          Harly doesn&apos;t recognise this app. Only continue if you started this connection yourself and trust{" "}
          <span className="font-medium">{host}</span> with your hiring data.
        </Callout>
      ) : null}

      <div className="mt-6 space-y-5">
        <ScopeGroup icon={<Eye className="size-3.5" />} heading="Read" items={reads} />
        <ScopeGroup icon={<PencilLine className="size-3.5" />} heading="Make changes" items={writes} />
      </div>

      <p className="mt-6 flex gap-2 text-[12.5px] leading-snug text-soft-ink">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Anything the app reads is sent to {client.name}, which handles it under its own terms. You can disconnect it
          at any time in Settings &gt; AI agents.
        </span>
      </p>

      <form action="/oauth/consent/decision" method="post" className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <input type="hidden" name="request" value={query} />
        {/* The workspace the person was shown; the decision is refused if the session now points elsewhere. */}
        <input type="hidden" name="workspace" value={workspaceId} />
        <Button type="submit" name="decision" value="deny" variant="outline" size="lg">
          Deny
        </Button>
        <Button type="submit" name="decision" value="approve" size="lg">
          Allow access
        </Button>
      </form>
    </Shell>
  );
}

function ScopeGroup({
  icon,
  heading,
  items,
}: {
  icon: React.ReactNode;
  heading: string;
  items: ReturnType<typeof describeScopes>;
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
            <p className="text-[13.5px] font-medium text-near-ink">{item.label}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-soft-ink">{item.description}</p>
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

function BlockedCard({ block }: { block: ConsentBlock }) {
  const copy = CONSENT_BLOCK_COPY[block.reason];
  const action =
    block.reason === "needs_2fa" || block.reason === "needs_passkey" ? (
      <Button asChild>
        <Link href="/setup-2fa">Continue to security setup</Link>
      </Button>
    ) : block.reason === "must_change_password" ? (
      <Button asChild>
        <Link href="/change-password">Change password</Link>
      </Button>
    ) : undefined;
  return <MessageCard title={copy.title} message={copy.body} action={action} />;
}
