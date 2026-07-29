"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";
import { Eye, EyeOff, Trash2, ExternalLink } from "lucide-react";

import {
  saveOAuthProviderAction,
  deleteOAuthProviderAction,
  type OAuthProvider,
  type OAuthProviderConfig,
} from "@/features/security/actions";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { SpinnerIcon } from "@/components/ui/icons/phosphor";

type ProviderInfo = {
  id: OAuthProvider;
  name: string;
  description: string;
  docsUrl: string;
  docsLabel: string;
  clientIdPlaceholder: string;
  environmentVariables: string;
};

const PROVIDERS: ProviderInfo[] = [
  {
    id: "google",
    name: "Google Workspace",
    description: "Allow team members to sign in with their Google account.",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    docsLabel: "Google Cloud Console",
    clientIdPlaceholder: "123456789.apps.googleusercontent.com",
    environmentVariables: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET",
  },
  {
    id: "microsoft",
    name: "Microsoft / Entra ID",
    description: "Allow team members to sign in with their Microsoft account.",
    docsUrl:
      "https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps",
    docsLabel: "Azure Portal",
    clientIdPlaceholder: "Application (client) ID, e.g. a UUID",
    environmentVariables: "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Allow team members to sign in with their GitHub account.",
    docsUrl: "https://github.com/settings/developers",
    docsLabel: "GitHub Developer Settings",
    clientIdPlaceholder: "OAuth App Client ID, e.g. Ov23li...",
    environmentVariables: "GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET",
  },
];

export function SsoConfigDrawer({
  provider,
  existingConfig,
}: {
  provider: OAuthProvider;
  existingConfig?: OAuthProviderConfig;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  const [clientId, setClientId] = useState(existingConfig?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [enabled, setEnabled] = useState(existingConfig?.enabled ?? true);

  const info = PROVIDERS.find((p) => p.id === provider)!;
  const isEditing = Boolean(existingConfig);

  function reset() {
    setClientId(existingConfig?.clientId ?? "");
    setClientSecret("");
    setShowSecret(false);
    setEnabled(existingConfig?.enabled ?? true);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    setOpen(next);
  }

  function save() {
    startSave(async () => {
      // For new configs, require both fields. For editing, allow secret to be empty (keep existing).
      if (!clientId.trim()) {
        toast.error("Client ID is required.");
        return;
      }
      if (!isEditing && !clientSecret.trim()) {
        toast.error("Client Secret is required for new configurations.");
        return;
      }
      if (isEditing && !clientSecret.trim()) {
        // Keep existing secret - just update clientId and enabled
        // We'll handle this by only sending clientId
      }

      const result = await saveOAuthProviderAction({
        provider,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
        enabled,
      });

      if (!result.ok) {
        toast.error(result.error ?? "Failed to save.");
        return;
      }

      toast.success(`${info.name} configured successfully.`);
      handleOpenChange(false);
      router.refresh();
    });
  }

  function remove() {
    if (!existingConfig) return;
    startDelete(async () => {
      const result = await deleteOAuthProviderAction(existingConfig.id);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to delete.");
        return;
      }
      toast.success(`${info.name} configuration removed.`);
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      mobilePresentation="bottom-on-mobile"
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          {isEditing ? "Configure" : "Set up"}
        </Button>
      </SheetTrigger>
      <DrawerLayout
        title={`${info.name} OAuth`}
        description={info.description}
        footer={
          isEditing ? (
            <>
              <Button
                variant="ghost"
                className="mr-auto text-destructive hover:text-destructive"
                disabled={saving || deleting}
                onClick={remove}
              >
                {deleting ? (
                  <SpinnerIcon className="size-4" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Remove
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || !clientId.trim()}>
                {saving ? <SpinnerIcon className="size-4" /> : null}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={save}
                disabled={saving || !clientId.trim() || !clientSecret.trim()}
              >
                {saving ? <SpinnerIcon className="size-4" /> : null}
                Save
              </Button>
            </>
          )
        }
      >
        <div className="space-y-5">
          {/* Link to provider docs */}
          <a
            href={info.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="size-3" />
            Open {info.docsLabel} to create OAuth credentials
          </a>

          {/* Client ID */}
          <div className="space-y-2">
            <Label htmlFor={`client-id-${provider}`}>Client ID</Label>
            <Input
              id={`client-id-${provider}`}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={info.clientIdPlaceholder}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Server fallback: <code>{info.environmentVariables}</code>
            </p>
          </div>

          {/* Client Secret */}
          <div className="space-y-2">
            <Label htmlFor={`client-secret-${provider}`}>
              Client Secret
              {isEditing && !clientSecret && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (leave empty to keep current)
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                id={`client-secret-${provider}`}
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={isEditing ? "••••••••" : "Enter client secret"}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {/* Enabled toggle */}
          {isEditing && (
            <label className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:border-foreground/15 cursor-pointer">
              <Checkbox
                checked={enabled}
                onCheckedChange={(v) => setEnabled(v === true)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Enabled</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Allow users to sign in with this provider
                </span>
              </span>
            </label>
          )}

          {/* Callback URL hint */}
          <div className="rounded-lg bg-muted/50 px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">
              Callback URL (set this in {info.docsLabel}):
            </p>
            <code className="mt-1 block break-all text-xs font-mono text-foreground">
              {typeof window !== "undefined" ? window.location.origin : ""}
              /api/auth/callback/{provider}
            </code>
          </div>
        </div>
      </DrawerLayout>
    </Sheet>
  );
}
