"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";
import type { ComponentType } from "react";

import {
  disableCaptchaAction,
  saveCaptchaSettingsAction,
} from "@/features/workspaces/captcha-settings-actions";
import type {
  CaptchaProvider,
  ProviderKeyStatus,
  WorkspaceCaptchaStatus,
} from "@/lib/captcha";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import {
  CloudflareLogo,
  HCaptchaLogo,
  ReCaptchaLogo,
} from "@/components/ui/icons/brands";
import {
  ArrowUpRightIcon,
  GearSixIcon,
  KeyDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Logo = ComponentType<{ className?: string }>;

/** Presentation copy per provider. Behavior is identical across all three. */
const PROVIDER_META: Record<
  CaptchaProvider,
  {
    name: string;
    logo: Logo;
    docsUrl: string;
    docsLabel: string;
    sitePlaceholder: string;
    secretHint: string;
  }
> = {
  turnstile: {
    name: "Cloudflare Turnstile",
    logo: CloudflareLogo,
    docsUrl: "https://developers.cloudflare.com/turnstile/get-started/",
    docsLabel: "Turnstile docs",
    sitePlaceholder: "0x4AAAAAAA…",
    secretHint:
      "Cloudflare dashboard → Turnstile → your site → Settings. Used server-side to verify each submission.",
  },
  recaptcha: {
    name: "Google reCAPTCHA",
    logo: ReCaptchaLogo,
    docsUrl: "https://developers.google.com/recaptcha/docs/display",
    docsLabel: "reCAPTCHA docs",
    sitePlaceholder: "6Lc…",
    secretHint:
      "reCAPTCHA admin console → your site → Settings → reCAPTCHA keys. Use a v2 checkbox key. Verified server-side on each submission.",
  },
  hcaptcha: {
    name: "hCaptcha",
    logo: HCaptchaLogo,
    docsUrl: "https://docs.hcaptcha.com/",
    docsLabel: "hCaptcha docs",
    sitePlaceholder: "10000000-ffff-ffff-ffff-000000000001",
    secretHint:
      "hCaptcha dashboard → Settings → Secret Key (and Sites for the site key). Verified server-side on each submission.",
  },
};

/**
 * CAPTCHA provider , bot protection on the public application form. BYO site +
 * secret keys (secret encrypted at rest). Only one provider is active per
 * workspace; enabling this one turns the others off.
 */
export function CaptchaConnectPanel({
  provider,
  status,
  canEdit,
  tileClassName,
  description,
}: {
  provider: CaptchaProvider;
  status: WorkspaceCaptchaStatus;
  canEdit: boolean;
  tileClassName: string;
  description: string;
}) {
  const router = useRouter();
  const meta = PROVIDER_META[provider];
  const keys: ProviderKeyStatus = status.providers[provider];
  const configured = keys.hasSecretKey && Boolean(keys.siteKey);
  const isActive = status.enabled && status.provider === provider;
  const [open, setOpen] = useState(configured);
  const [togglePending, startToggle] = useTransition();

  const statusTone = configured ? (isActive ? "on" : "off") : "neutral";
  const statusLabel = configured
    ? isActive
      ? "Protecting"
      : "Disabled"
    : "Not connected";

  function toggleEnabled(next: boolean) {
    if (!configured) return;
    startToggle(async () => {
      const result = next
        ? await saveCaptchaSettingsAction({ provider, enabled: true })
        : await disableCaptchaAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(next ? `${meta.name} enabled` : `${meta.name} disabled`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={meta.logo}
        tileClassName={tileClassName}
        name={meta.name}
        description={description}
        statusLabel={statusLabel}
        statusTone={statusTone}
        action={
          canEdit ? (
            <>
              <Button
                variant={configured ? "outline" : "default"}
                disabled={!status.encryptionReady}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                {configured ? (
                  <GearSixIcon className="size-4" />
                ) : (
                  <KeyDuotoneIcon className="size-4" />
                )}
                {configured ? (open ? "Hide settings" : "Manage") : "Connect"}
              </Button>
              {configured ? (
                <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                  <Switch
                    checked={isActive}
                    disabled={togglePending}
                    onCheckedChange={toggleEnabled}
                    aria-label={`Enable ${meta.name}`}
                  />
                  <span className="text-muted-foreground">
                    {isActive ? "On" : "Off"}
                  </span>
                </label>
              ) : null}
            </>
          ) : null
        }
      />

      {status.enabled && status.provider !== provider && configured ? (
        <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Another CAPTCHA is currently active. Turning this one on will switch
            protection to {meta.name}.
          </p>
        </div>
      ) : null}

      {!status.encryptionReady ? (
        <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on
            the server to store the {meta.name} secret.
          </p>
        </div>
      ) : null}

      {configured ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <StatCell label="Site key">
              <span className="truncate font-mono text-[13px] text-muted-foreground">
                {keys.siteKey}
              </span>
            </StatCell>
            <StatCell label="Secret key">
              <span className="font-mono text-[13px]">•••••••• stored</span>
            </StatCell>
          </div>
        </Card>
      ) : null}

      {canEdit ? (
        <InlineReveal open={open}>
          <CaptchaConnectForm
            provider={provider}
            keys={keys}
            isActive={isActive}
            connected={configured}
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </InlineReveal>
      ) : null}
    </div>
  );
}

function CaptchaConnectForm({
  provider,
  keys,
  isActive,
  connected,
  onSaved,
}: {
  provider: CaptchaProvider;
  keys: ProviderKeyStatus;
  isActive: boolean;
  connected: boolean;
  onSaved: () => void;
}) {
  const router = useRouter();
  const meta = PROVIDER_META[provider];
  const [siteKey, setSiteKey] = useState(keys.siteKey ?? "");
  const [secretKey, setSecretKey] = useState("");
  const [enabled, setEnabled] = useState(connected ? isActive : true);
  const [saving, startSave] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();

  function save() {
    startSave(async () => {
      const result = await saveCaptchaSettingsAction({
        provider,
        enabled,
        siteKey,
        secretKey: secretKey || undefined,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success(`${meta.name} settings saved`);
      onSaved();
    });
  }

  function disconnect() {
    startDisconnect(async () => {
      const result = await disableCaptchaAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not disconnect.");
        return;
      }
      toast.success(`${meta.name} disabled`);
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight">
            {connected ? "Manage connection" : `Connect ${meta.name}`}
          </h2>
          <p className="text-sm text-muted-foreground">
            Your secret key is encrypted at rest and never shown again. The site
            key is public.
          </p>
        </div>
        <a
          href={meta.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-pine transition-colors hover:text-pine-strong"
        >
          {meta.docsLabel}
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="captcha-site">Site key</Label>
          <Input
            id="captcha-site"
            value={siteKey}
            onChange={(event) => setSiteKey(event.target.value)}
            placeholder={meta.sitePlaceholder}
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Public key rendered in the form widget.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="captcha-secret">Secret key</Label>
          <Input
            id="captcha-secret"
            type="password"
            value={secretKey}
            onChange={(event) => setSecretKey(event.target.value)}
            placeholder={
              keys.hasSecretKey
                ? "•••••••• (stored, leave blank to keep)"
                : meta.sitePlaceholder
            }
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">{meta.secretHint}</p>
        </div>

        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Enable {meta.name}</p>
            <p className="text-xs text-muted-foreground">
              Turns on this CAPTCHA and switches off any other. When off, the
              application form skips bot verification.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
        {connected ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={disconnect}
            disabled={disconnecting}
          >
            {disconnecting ? <SpinnerIcon className="size-3.5" /> : null}
            Disconnect
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={save} disabled={saving}>
          {saving ? <SpinnerIcon className="size-4" /> : null}
          Save
        </Button>
      </div>
    </Card>
  );
}
