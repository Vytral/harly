"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Trash2, ExternalLink, Plus } from "lucide-react";

import {
  registerSSOProviderAction,
  deleteSSOProviderAction,
  type SSOProviderConfig,
  type SSORegisterInput,
} from "@/features/security/sso-actions";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { SpinnerIcon } from "@/components/ui/icons/phosphor";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SSOProviderType = "oidc" | "saml";

export function SsoProviderDrawer({
  existingProvider,
}: {
  existingProvider?: SSOProviderConfig;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  // Common fields
  const [providerId, setProviderId] = useState(existingProvider?.providerId ?? "");
  const [issuer, setIssuer] = useState(existingProvider?.issuer ?? "");
  const [domain, setDomain] = useState(existingProvider?.domain ?? "");
  const [providerType, setProviderType] = useState<SSOProviderType>("oidc");

  // OIDC fields
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [showOidcSecret, setShowOidcSecret] = useState(false);

  // SAML fields
  const [samlEntryPoint, setSamlEntryPoint] = useState("");
  const [samlCert, setSamlCert] = useState("");
  const [samlAudience, setSamlAudience] = useState("");

  const isEditing = Boolean(existingProvider);

  function reset() {
    setProviderId(existingProvider?.providerId ?? "");
    setIssuer(existingProvider?.issuer ?? "");
    setDomain(existingProvider?.domain ?? "");
    setProviderType("oidc");
    setOidcClientId("");
    setOidcClientSecret("");
    setShowOidcSecret(false);
    setSamlEntryPoint("");
    setSamlCert("");
    setSamlAudience("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    setOpen(next);
  }

  function save() {
    startSave(async () => {
      // Validate common fields
      if (!providerId.trim()) {
        toast.error("Provider ID is required.");
        return;
      }
      if (!issuer.trim()) {
        toast.error("Issuer URL is required.");
        return;
      }
      if (!domain.trim()) {
        toast.error("Domain is required.");
        return;
      }

      // Validate based on type
      if (providerType === "oidc") {
        if (!oidcClientId.trim() || !oidcClientSecret.trim()) {
          toast.error("Client ID and Client Secret are required for OIDC.");
          return;
        }
      } else {
        if (!samlEntryPoint.trim() || !samlCert.trim()) {
          toast.error("Entry Point and Certificate are required for SAML.");
          return;
        }
      }

      const input: SSORegisterInput = {
        providerId: providerId.trim(),
        issuer: issuer.trim(),
        domain: domain.trim(),
      };

      if (providerType === "oidc") {
        input.oidcConfig = {
          clientId: oidcClientId.trim(),
          clientSecret: oidcClientSecret.trim(),
        };
      } else {
        input.samlConfig = {
          entryPoint: samlEntryPoint.trim(),
          cert: samlCert.trim(),
          audience: samlAudience.trim() || undefined,
          callbackUrl: `${typeof window !== "undefined" ? window.location.origin : ""}/api/auth/sso/saml2/sp/acs/${providerId.trim()}`,
        };
      }

      const result = await registerSSOProviderAction(input);

      if (!result.ok) {
        toast.error(result.error ?? "Failed to register SSO provider.");
        return;
      }

      toast.success("SSO provider registered successfully.");
      handleOpenChange(false);
      router.refresh();
    });
  }

  function remove() {
    if (!existingProvider) return;
    startDelete(async () => {
      const result = await deleteSSOProviderAction(existingProvider.providerId);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to delete.");
        return;
      }
      toast.success("SSO provider removed.");
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {isEditing ? (
          <Button variant="outline" size="sm">
            Configure
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus className="size-4 mr-1" />
            Add Provider
          </Button>
        )}
      </SheetTrigger>
      <DrawerLayout
        title={isEditing ? "Configure SSO Provider" : "Add Enterprise SSO Provider"}
        description="Set up SAML 2.0 or OpenID Connect (OIDC) for enterprise single sign-on."
        footer={
          isEditing ? (
            <>
              <Button
                variant="ghost"
                className="mr-auto text-destructive hover:text-destructive"
                disabled={saving || deleting}
                onClick={remove}
              >
                {deleting ? <SpinnerIcon className="size-4" /> : <Trash2 className="size-4" />}
                Remove
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || !providerId.trim() || !issuer.trim() || !domain.trim()}>
                {saving ? <SpinnerIcon className="size-4" /> : null}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={saving} onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={save}
                disabled={
                  saving ||
                  !providerId.trim() ||
                  !issuer.trim() ||
                  !domain.trim() ||
                  (providerType === "oidc" && (!oidcClientId.trim() || !oidcClientSecret.trim())) ||
                  (providerType === "saml" && (!samlEntryPoint.trim() || !samlCert.trim()))
                }
              >
                {saving ? <SpinnerIcon className="size-4" /> : null}
                Register Provider
              </Button>
            </>
          )
        }
      >
        <div className="space-y-5">
          {/* Provider Type Tabs */}
          <Tabs value={providerType} onValueChange={(v) => setProviderType(v as SSOProviderType)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="oidc">OpenID Connect (OIDC)</TabsTrigger>
              <TabsTrigger value="saml">SAML 2.0</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Provider ID */}
          <div className="space-y-2">
            <Label htmlFor="sso-provider-id">Provider ID</Label>
            <Input
              id="sso-provider-id"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              placeholder="e.g. okta-prod, azure-ad"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier for this provider (e.g., &quot;okta&quot;, &quot;azure-ad&quot;)
            </p>
          </div>

          {/* Issuer URL */}
          <div className="space-y-2">
            <Label htmlFor="sso-issuer">Issuer URL</Label>
            <Input
              id="sso-issuer"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder="e.g. https://your-org.okta.com"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              The issuer URL of your identity provider
            </p>
          </div>

          {/* Domain */}
          <div className="space-y-2">
            <Label htmlFor="sso-domain">Email Domain</Label>
            <Input
              id="sso-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. yourcompany.com"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Users with this email domain will be redirected to this provider
            </p>
          </div>

          {/* OIDC Configuration */}
          {providerType === "oidc" && (
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm font-medium">OIDC Configuration</p>
              <p className="text-xs text-muted-foreground">
                Most fields are auto-discovered from the issuer&apos;s discovery document.
              </p>

              <div className="space-y-2">
                <Label htmlFor="oidc-client-id">Client ID</Label>
                <Input
                  id="oidc-client-id"
                  value={oidcClientId}
                  onChange={(e) => setOidcClientId(e.target.value)}
                  placeholder="OAuth client ID from your IdP"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="oidc-client-secret">Client Secret</Label>
                <div className="relative">
                  <Input
                    id="oidc-client-secret"
                    type={showOidcSecret ? "text" : "password"}
                    value={oidcClientSecret}
                    onChange={(e) => setOidcClientSecret(e.target.value)}
                    placeholder="OAuth client secret from your IdP"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOidcSecret(!showOidcSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showOidcSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SAML Configuration */}
          {providerType === "saml" && (
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm font-medium">SAML 2.0 Configuration</p>
              <p className="text-xs text-muted-foreground">
                Configure your Identity Provider (IdP) settings for SAML SSO.
              </p>

              <div className="space-y-2">
                <Label htmlFor="saml-entry-point">Entry Point (SSO URL)</Label>
                <Input
                  id="saml-entry-point"
                  value={samlEntryPoint}
                  onChange={(e) => setSamlEntryPoint(e.target.value)}
                  placeholder="https://idp.example.com/sso"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="saml-cert">X.509 Certificate</Label>
                <div className="relative">
                  <textarea
                    id="saml-cert"
                    value={samlCert}
                    onChange={(e) => setSamlCert(e.target.value)}
                    placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                    className="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    rows={4}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The public certificate from your IdP to verify SAML responses
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="saml-audience">Audience (Optional)</Label>
                <Input
                  id="saml-audience"
                  value={samlAudience}
                  onChange={(e) => setSamlAudience(e.target.value)}
                  placeholder="https://yourapp.com"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  The SP Entity ID / Audience URI (defaults to your app URL)
                </p>
              </div>
            </div>
          )}

          {/* Callback URL hint */}
          <div className="rounded-lg bg-muted/50 px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">
              ACS Callback URL (set this in your Identity Provider):
            </p>
            <code className="mt-1 block break-all text-xs font-mono text-foreground">
              {typeof window !== "undefined" ? window.location.origin : ""}/api/auth/sso/saml2/sp/acs/{providerId || "<provider-id>"}
            </code>
          </div>

          {/* Docs link */}
          <a
            href="https://www.better-auth.com/docs/plugins/sso"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="size-3" />
            Read the SSO documentation
          </a>
        </div>
      </DrawerLayout>
    </Sheet>
  );
}
