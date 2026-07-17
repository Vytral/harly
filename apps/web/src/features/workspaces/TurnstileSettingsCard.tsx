"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disableTurnstileAction,
  saveTurnstileSettingsAction,
} from "@/features/workspaces/turnstile-settings-actions";
import type { WorkspaceTurnstileStatus } from "@/lib/turnstile";
import {
  SectionHeader,
  StatCell,
  StatusPill,
} from "@/features/workspaces/settings-ui";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { CloudflareLogo } from "@/components/ui/icons/brands";
import {
  KeyDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

export function TurnstileSettingsCard({
  status,
  canEdit,
}: {
  status: WorkspaceTurnstileStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [togglePending, startToggle] = useTransition();

  const configured = status.hasSecretKey && Boolean(status.siteKey);

  function toggleEnabled(next: boolean) {
    if (!configured && next) {
      toast.error("Add the Turnstile keys first.");
      return;
    }
    startToggle(async () => {
      const result = next
        ? await saveTurnstileSettingsAction({ enabled: true })
        : await disableTurnstileAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(next ? "Turnstile enabled" : "Turnstile disabled");
      router.refresh();
    });
  }

  const badge = configured ? (
    <StatusPill tone={status.enabled ? "on" : "off"}>
      {status.enabled ? "Protecting" : "Disabled"}
    </StatusPill>
  ) : (
    <StatusPill tone="neutral">Not connected</StatusPill>
  );

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="p-6">
        <SectionHeader
          icon={CloudflareLogo}
          title="Cloudflare Turnstile"
          badge={badge}
          description="Bot protection on your public application form. A privacy-friendly CAPTCHA alternative. Bring your own Turnstile keys, no env vars needed."
          action={
            canEdit ? (
              <>
                <Sheet open={open} onOpenChange={setOpen} mobilePresentation="bottom-on-mobile">
                  <SheetTrigger asChild>
                    <Button
                      variant={configured ? "outline" : "default"}
                      disabled={!status.encryptionReady}
                    >
                      <KeyDuotoneIcon className="size-4" />
                      {configured ? "Manage" : "Connect"}
                    </Button>
                  </SheetTrigger>
                  <TurnstileSettingsForm
                    status={status}
                    onSaved={() => {
                      setOpen(false);
                      router.refresh();
                    }}
                  />
                </Sheet>
                {configured ? (
                  <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                    <Switch
                      checked={status.enabled}
                      disabled={togglePending}
                      onCheckedChange={toggleEnabled}
                      aria-label="Enable Turnstile"
                    />
                    <span className="text-muted-foreground">
                      {status.enabled ? "On" : "Off"}
                    </span>
                  </label>
                ) : null}
              </>
            ) : null
          }
        />

        {!status.encryptionReady ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              Set <code className="font-mono text-xs">AI_ENCRYPTION_KEY</code> on
              the server to store the Turnstile secret.
            </p>
          </div>
        ) : null}
      </div>

      {configured ? (
        <div className="grid grid-cols-1 divide-y border-t bg-muted/20 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <StatCell label="Site key">
            <span className="truncate font-mono text-[13px] text-muted-foreground">
              {status.siteKey}
            </span>
          </StatCell>
          <StatCell label="Secret key">
            <span className="font-mono text-[13px]">•••••••• stored</span>
          </StatCell>
        </div>
      ) : null}
    </Card>
  );
}

function TurnstileSettingsForm({
  status,
  onSaved,
}: {
  status: WorkspaceTurnstileStatus;
  onSaved: () => void;
}) {
  const [siteKey, setSiteKey] = useState(status.siteKey ?? "");
  const [secretKey, setSecretKey] = useState("");
  const [enabled, setEnabled] = useState(status.enabled || !status.hasSecretKey);
  const [saving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      const result = await saveTurnstileSettingsAction({
        enabled,
        siteKey,
        secretKey: secretKey || undefined,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save.");
        return;
      }
      toast.success("Turnstile settings saved");
      onSaved();
    });
  }

  return (
    <DrawerLayout
      title="Connect Turnstile"
      description="Your secret key is encrypted at rest and never shown again. The site key is public."
      footer={
        <>
          <SheetClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={save} disabled={saving}>
            {saving ? <SpinnerIcon className="size-4" /> : null}
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="ts-site">Site key</Label>
          <Input
            id="ts-site"
            value={siteKey}
            onChange={(event) => setSiteKey(event.target.value)}
            placeholder="0x4AAAAAAA…"
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Public key rendered in the form widget.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ts-secret">Secret key</Label>
          <Input
            id="ts-secret"
            type="password"
            value={secretKey}
            onChange={(event) => setSecretKey(event.target.value)}
            placeholder={
              status.hasSecretKey
                ? "•••••••• (stored, leave blank to keep)"
                : "0x4AAAAAAA…"
            }
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Cloudflare dashboard → Turnstile → your site → Settings. Used
            server-side to verify each submission.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Enable Turnstile</p>
            <p className="text-xs text-muted-foreground">
              When off, the application form skips bot verification.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>
    </DrawerLayout>
  );
}
