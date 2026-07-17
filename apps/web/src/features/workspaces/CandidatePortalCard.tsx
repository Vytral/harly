"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import type { Route } from "next";

import {
  savePortalSettingsAction,
  savePortalOAuthAction,
  disconnectPortalOAuthAction,
  savePortalUiOptionsAction,
} from "@/features/workspaces/portal-settings-actions";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { GithubIcon } from "@/components/ui/icons/GithubIcon";
import { LinkedinLogo } from "@/components/ui/icons/brands";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import {
  IdentificationCardDuotoneIcon,
  SpinnerIcon,
  CheckIcon,
} from "@/components/ui/icons/phosphor";

// Inline SVG logos , no external deps
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

type PortalOAuthProvider = "google" | "github" | "linkedin";

type OAuthProviderSectionProps = {
  provider: PortalOAuthProvider;
  label: string;
  logo: React.ComponentType<{ className?: string }>;
  configured: boolean;
  savedClientId: string;
  canEdit: boolean;
  description: string;
  redirectUri: string;
};

function OAuthProviderSection({
  provider,
  label,
  logo: Logo,
  configured,
  savedClientId,
  canEdit,
  description,
  redirectUri,
}: OAuthProviderSectionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(savedClientId);
  const [clientSecret, setClientSecret] = useState("");
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setClientId(savedClientId);
      setClientSecret("");
    }
    setOpen(next);
  }

  function save() {
    startSave(async () => {
      const result = await savePortalOAuthAction({
        provider,
        clientId,
        clientSecret: clientSecret || undefined,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success(`${label} connected`);
      setClientSecret("");
      setOpen(false);
      router.refresh();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectPortalOAuthAction(provider);
      if (!result.ok) {
        toast.error(result.error ?? "Could not disconnect.");
        return;
      }
      toast.success(`${label} disconnected`);
      setClientId("");
      setClientSecret("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-lg border bg-muted/50">
          <Logo className="size-4" />
        </span>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {configured ? (
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            <CheckIcon className="size-3" /> Connected
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not configured</span>
        )}
        {canEdit ? (
          <Sheet open={open} onOpenChange={handleOpenChange} mobilePresentation="bottom-on-mobile">
            <SheetTrigger asChild>
              <Button
                variant={configured ? "ghost" : "outline"}
                size="sm"
                className={configured ? "text-muted-foreground" : undefined}
              >
                {configured ? "Edit" : "Configure"}
              </Button>
            </SheetTrigger>
            <DrawerLayout
              title={`Configure ${label} sign-in`}
              description={`Use ${label} OAuth so candidates can sign in to the portal with their existing account.`}
              footer={
                <>
                  {configured ? (
                    <Button
                      variant="ghost"
                      className="mr-auto text-destructive hover:text-destructive"
                      onClick={disconnect}
                      disabled={saving || disconnecting}
                    >
                      {disconnecting ? (
                        <SpinnerIcon className="size-4" />
                      ) : null}
                      Disconnect
                    </Button>
                  ) : null}
                  <SheetClose asChild>
                    <Button
                      variant="outline"
                      disabled={saving || disconnecting}
                    >
                      Cancel
                    </Button>
                  </SheetClose>
                  <Button
                    onClick={save}
                    disabled={saving || disconnecting || !clientId.trim()}
                  >
                    {saving ? <SpinnerIcon className="size-4" /> : null}
                    Save
                  </Button>
                </>
              }
            >
              <div className="space-y-5">
                <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                  <p>
                    Credentials are encrypted at rest and the secret is never
                    shown again.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${provider}-client-id`}>Client ID</Label>
                  <Input
                    id={`${provider}-client-id`}
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Paste your Client ID"
                    autoComplete="off"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${provider}-client-secret`}>
                    Client Secret{" "}
                    {configured ? (
                      <span className="font-normal text-muted-foreground">
                        (leave blank to keep existing)
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id={`${provider}-client-secret`}
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder={
                      configured ? "••••••••" : "Paste your Client Secret"
                    }
                    autoComplete="new-password"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  <p>Authorized redirect URI</p>
                  <p className="break-all font-mono text-foreground">
                    {redirectUri}
                  </p>
                </div>
              </div>
            </DrawerLayout>
          </Sheet>
        ) : null}
      </div>
    </div>
  );
}

export function CandidatePortalCard({
  enabled,
  canEdit,
  googleConfigured,
  googleClientId,
  githubConfigured,
  githubClientId,
  linkedinConfigured,
  linkedinClientId,
  appUrl,
  showApplicationStatus,
}: {
  enabled: boolean;
  canEdit: boolean;
  googleConfigured: boolean;
  googleClientId: string;
  githubConfigured: boolean;
  githubClientId: string;
  linkedinConfigured: boolean;
  linkedinClientId: string;
  appUrl: string;
  showApplicationStatus: boolean;
}) {
  const router = useRouter();
  const [optimisticEnabled, setOptimisticEnabled] = useState(enabled);
  const [optimisticStatus, setOptimisticStatus] = useState(
    showApplicationStatus,
  );
  const [toggling, startToggle] = useTransition();
  const [savingUi, startSaveUi] = useTransition();

  const googleRedirect = `${appUrl}/api/portal/auth/callback/google`;
  const githubRedirect = `${appUrl}/api/portal/auth/callback/github`;
  const linkedinRedirect = `${appUrl}/api/portal/auth/callback/linkedin`;

  function toggleEnabled(next: boolean) {
    setOptimisticEnabled(next);
    startToggle(async () => {
      const result = await savePortalSettingsAction(next);
      if (!result.ok) {
        setOptimisticEnabled(!next);
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(
        next ? "Candidate portal enabled" : "Candidate portal disabled",
      );
      router.refresh();
    });
  }

  function toggleStatus(next: boolean) {
    setOptimisticStatus(next);
    startSaveUi(async () => {
      const result = await savePortalUiOptionsAction({
        showApplicationStatus: next,
      });
      if (!result.ok) {
        setOptimisticStatus(!next);
        toast.error(result.error ?? "Could not update.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Main card */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="p-6">
          <SectionHeader
            icon={IdentificationCardDuotoneIcon}
            title="Candidate Portal"
            badge={
              <StatusPill tone={optimisticEnabled ? "on" : "off"}>
                {optimisticEnabled ? "Active" : "Disabled"}
              </StatusPill>
            }
            description="A self-service portal where candidates can sign in, track their applications, and update their profile."
            action={
              canEdit ? (
                <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                  <Switch
                    checked={optimisticEnabled}
                    disabled={toggling}
                    onCheckedChange={toggleEnabled}
                    aria-label="Enable portal"
                  />
                  <span className="text-muted-foreground">
                    {optimisticEnabled ? "On" : "Off"}
                  </span>
                </label>
              ) : null
            }
          />

          {optimisticEnabled ? (
            <div className="mt-4 rounded-xl border bg-muted/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Portal URL:{" "}
                <Link
                  href={"/portal/login" as Route}
                  target="_blank"
                  className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                >
                  {appUrl}/portal
                </Link>
              </p>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <FeatureCell label="Authentication" value="Magic link · OAuth" />
          <FeatureCell
            label="Candidate views"
            value="Applications · Jobs · Profile"
          />
          <FeatureCell
            label="Sign-in methods"
            value="Email · Google · GitHub · LinkedIn"
          />
        </div>
      </Card>

      {/* OAuth providers */}
      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground/80">
          Sign-in providers
        </h2>
        <div className="space-y-3">
          {/* Magic link , always available */}
          <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg border bg-muted/50">
                <svg
                  className="size-4 text-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                  />
                </svg>
              </span>
              <div>
                <p className="text-sm font-medium">Magic link (email)</p>
                <p className="text-xs text-muted-foreground">
                  Passwordless. Candidates enter their email and receive a
                  sign-in link.
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              <CheckIcon className="size-3" /> Always on
            </span>
          </div>

          <OAuthProviderSection
            key={`google-${googleClientId}`}
            provider="google"
            label="Google"
            logo={GoogleLogo}
            configured={googleConfigured}
            savedClientId={googleClientId}
            canEdit={canEdit}
            description="Candidates sign in with their Google account."
            redirectUri={googleRedirect}
          />

          <OAuthProviderSection
            key={`github-${githubClientId}`}
            provider="github"
            label="GitHub"
            logo={GithubIcon}
            configured={githubConfigured}
            savedClientId={githubClientId}
            canEdit={canEdit}
            description="Candidates sign in with their GitHub account."
            redirectUri={githubRedirect}
          />

          <OAuthProviderSection
            key={`linkedin-${linkedinClientId}`}
            provider="linkedin"
            label="LinkedIn"
            logo={LinkedinLogo}
            configured={linkedinConfigured}
            savedClientId={linkedinClientId}
            canEdit={canEdit}
            description="Candidates sign in with their LinkedIn account."
            redirectUri={linkedinRedirect}
          />
        </div>
      </div>

      {/* UI options */}
      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground/80">
          Portal options
        </h2>
        <Card className="gap-0 divide-y p-0">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium">Show application status</p>
              <p className="text-xs text-muted-foreground">
                Candidates can see which pipeline stage they are in (e.g.
                &quot;Screening&quot;, &quot;Interview&quot;).
              </p>
            </div>
            <Switch
              checked={optimisticStatus}
              onCheckedChange={toggleStatus}
              disabled={!canEdit || savingUi}
              aria-label="Show application status"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function FeatureCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
    </div>
  );
}
