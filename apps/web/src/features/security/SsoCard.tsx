"use client";

import { useTransition } from "react";

import { authClient } from "@harly/auth/client";
import { SectionHeader, StatusPill, BrandTile } from "@/features/workspaces/settings-ui";
import { SsoDuotoneIcon, CheckIcon } from "@/components/ui/icons/phosphor";
import { Card } from "@/components/ui/card";
import { SsoConfigDrawer } from "@/features/security/SsoConfigDrawer";
import { SsoProviderDrawer } from "@/features/security/SsoProviderDrawer";
import type { OAuthProviderConfig, OAuthProvider } from "@/features/security/actions";
import type { SSOProviderConfig } from "@/features/security/sso-actions";

function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 23 23" className={className} aria-hidden>
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

function GithubLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.298 24 12c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  );
}

type ProviderInfo = {
  id: OAuthProvider;
  name: string;
  logo: React.ReactNode;
};

export function SsoCard({
  providerConfigs,
  existingConfigs,
  ssoProviders,
}: {
  providerConfigs: Record<OAuthProvider, { configured: boolean; source: "db" | "env" | null }>;
  existingConfigs: OAuthProviderConfig[];
  ssoProviders?: SSOProviderConfig[];
}) {
  const [isPending, startTransition] = useTransition();

  function connect(provider: OAuthProvider) {
    startTransition(async () => {
      await authClient.signIn.social({
        provider,
        callbackURL: "/settings/security",
      });
    });
  }

  const anyConfigured = Object.values(providerConfigs).some((p) => p.configured);
  const hasEnterpriseSso = (ssoProviders?.length ?? 0) > 0;

  const providers: ProviderInfo[] = [
    {
      id: "google",
      name: "Google Workspace",
      logo: <GoogleLogo />,
    },
    {
      id: "microsoft",
      name: "Microsoft / Entra ID",
      logo: <MicrosoftLogo className="size-5" />,
    },
    {
      id: "github",
      name: "GitHub",
      logo: <GithubLogo className="size-4 text-foreground" />,
    },
  ];

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={SsoDuotoneIcon}
        title="Single Sign-On"
        description="Allow team members to authenticate via OAuth providers or enterprise SSO."
        badge={
          anyConfigured || hasEnterpriseSso ? (
            <StatusPill tone="on">SSO configured</StatusPill>
          ) : (
            <StatusPill tone="off">No SSO configured</StatusPill>
          )
        }
      />

      <div className="space-y-2">
        {providers.map((provider) => {
          const config = providerConfigs[provider.id];
          const existingConfig = existingConfigs.find((c) => c.provider === provider.id);
          const isConfigured = config?.configured ?? false;
          const source = config?.source;

          return (
            <div
              key={provider.id}
              className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <BrandTile>{provider.logo}</BrandTile>
                <div>
                  <p className="text-sm font-medium">{provider.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isConfigured ? (
                      <>
                        Configured
                        {source === "env" && (
                          <span className="ml-1 text-muted-foreground">(via env vars)</span>
                        )}
                      </>
                    ) : (
                      "Not configured"
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isConfigured ? (
                  <button
                    type="button"
                    onClick={() => connect(provider.id)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-pine/20 bg-sage/30 px-2.5 py-1 text-xs font-medium text-pine transition-colors hover:bg-sage/50 disabled:opacity-50"
                  >
                    <CheckIcon className="size-3" />
                    Connect account
                  </button>
                ) : null}
                <SsoConfigDrawer
                  provider={provider.id}
                  existingConfig={existingConfig}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        You can configure OAuth credentials here or via environment variables. 
        Database configuration takes precedence over env vars.
      </p>

      {/* Enterprise SSO Section */}
      <div className="border-t pt-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium">Enterprise SSO</h3>
            <p className="text-xs text-muted-foreground">
              Configure SAML 2.0 or OpenID Connect for enterprise single sign-on.
            </p>
          </div>
          <SsoProviderDrawer />
        </div>

        {ssoProviders && ssoProviders.length > 0 ? (
          <div className="space-y-2">
            {ssoProviders.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                    <span className="text-xs font-medium">
                      {provider.issuer.includes("okta") ? "Okta" :
                       provider.issuer.includes("azure") ? "Azure" :
                       provider.issuer.includes("google") ? "Google" :
                       provider.issuer.includes("onelogin") ? "OneLogin" :
                       "SSO"}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{provider.providerId}</p>
                    <p className="text-xs text-muted-foreground">
                      {provider.domain} • {provider.issuer}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={provider.enabled ? "on" : "off"}>
                    {provider.enabled ? "Active" : "Disabled"}
                  </StatusPill>
                  <SsoProviderDrawer existingProvider={provider} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No enterprise SSO providers configured.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a provider to enable SAML or OIDC authentication for your organization.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
