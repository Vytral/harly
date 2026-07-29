"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/notification-island/toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import { ShieldCheckDuotoneIcon } from "@/components/ui/icons/phosphor";
import { updateAdvancedSecurityPolicyAction } from "./actions";
import { ensureSensitiveActionReauth } from "./reauth-client";

export function AdvancedSecurityCard({
  settings,
  isOwner,
}: {
  settings: {
    ipAllowlist: string[];
    allowedDomains: string[];
    riskDetectionEnabled: boolean;
    reauthMinutes: number;
    requirePasskey: boolean;
  };
  isOwner: boolean;
}) {
  const [ips, setIps] = useState(settings.ipAllowlist.join(", "));
  const [domains, setDomains] = useState(settings.allowedDomains.join(", "));
  const [risk, setRisk] = useState(settings.riskDetectionEnabled);
  const [reauthMinutes, setReauthMinutes] = useState(String(settings.reauthMinutes));
  const [requirePasskey, setRequirePasskey] = useState(settings.requirePasskey);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      let result;
      try {
        await ensureSensitiveActionReauth();
        result = await updateAdvancedSecurityPolicyAction({
        ipAllowlist: ips.split(",").map((value) => value.trim()).filter(Boolean),
        allowedDomains: domains.split(",").map((value) => value.trim()).filter(Boolean),
        riskDetectionEnabled: risk,
        reauthMinutes: Number(reauthMinutes),
        requirePasskey,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Reauthentication failed.");
        return;
      }
      if (!result.ok) toast.error(result.error ?? "Could not update security policy.");
      else toast.success("Enterprise security policy updated.");
    });
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={ShieldCheckDuotoneIcon}
        title="Enterprise access controls"
        description="Restrict workspace access, detect risky session changes, and require reauthentication for sensitive actions."
        badge={<StatusPill tone={settings.ipAllowlist.length || settings.allowedDomains.length ? "on" : "neutral"}>{settings.ipAllowlist.length || settings.allowedDomains.length ? "Restricted" : "Open"}</StatusPill>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="security-ips">Allowed IPs / CIDRs</Label><Input id="security-ips" value={ips} onChange={(event) => setIps(event.target.value)} placeholder="203.0.113.10, 10.0.0.0/8" disabled={!isOwner} /><p className="text-xs text-muted-foreground">Comma-separated. Empty means any IP.</p></div>
        <div className="space-y-2"><Label htmlFor="security-domains">Allowed email domains</Label><Input id="security-domains" value={domains} onChange={(event) => setDomains(event.target.value)} placeholder="acme.com, subsidiary.acme.com" disabled={!isOwner} /><p className="text-xs text-muted-foreground">Used for workspace identity and SSO policy.</p></div>
        <div className="space-y-2"><Label htmlFor="security-reauth">Reauthentication window (minutes)</Label><Input id="security-reauth" type="number" min={5} max={60} value={reauthMinutes} onChange={(event) => setReauthMinutes(event.target.value)} disabled={!isOwner} /></div>
        <div className="flex items-center justify-between rounded-xl border p-3"><div><p className="text-sm font-medium">Suspicious session detection</p><p className="text-xs text-muted-foreground">Flag simultaneous IP and browser-family changes.</p></div><Switch checked={risk} onCheckedChange={setRisk} disabled={!isOwner} /></div>
        <div className="flex items-center justify-between rounded-xl border p-3 md:col-span-2"><div><p className="text-sm font-medium">Require passkey</p><p className="text-xs text-muted-foreground">Future-ready policy: members must register a passkey before access.</p></div><Switch checked={requirePasskey} onCheckedChange={setRequirePasskey} disabled={!isOwner} /></div>
      </div>
      {isOwner ? <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save security policy"}</Button> : <p className="text-xs text-muted-foreground">Only workspace owners can change these controls.</p>}
    </Card>
  );
}
