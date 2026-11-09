"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/Form";
import { SettingRow, SettingRows } from "@/components/ui/setting-row";
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
  const t = useTranslations("features.security.advancedSecurityCard");
  const tReauth = useTranslations("labels.security.reauth");

  function save() {
    startTransition(async () => {
      let result;
      try {
        await ensureSensitiveActionReauth(tReauth);
        result = await updateAdvancedSecurityPolicyAction({
        ipAllowlist: ips.split(",").map((value) => value.trim()).filter(Boolean),
        allowedDomains: domains.split(",").map((value) => value.trim()).filter(Boolean),
        riskDetectionEnabled: risk,
        reauthMinutes: Number(reauthMinutes),
        requirePasskey,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("reauthFailed"));
        return;
      }
      if (!result.ok) toast.error(result.error ?? t("updateFailed"));
      else toast.success(t("updated"));
    });
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={ShieldCheckDuotoneIcon}
        title={t("title")}
        description={t("description")}
        badge={<StatusPill tone={settings.ipAllowlist.length || settings.allowedDomains.length ? "on" : "neutral"}>{settings.ipAllowlist.length || settings.allowedDomains.length ? t("restricted") : t("open")}</StatusPill>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t("allowedIps")} htmlFor="security-ips" hint={t("allowedIpsHint")}>
          <Input id="security-ips" value={ips} onChange={(event) => setIps(event.target.value)} placeholder="203.0.113.10, 10.0.0.0/8" disabled={!isOwner} />
        </FormField>
        <FormField label={t("allowedDomains")} htmlFor="security-domains" hint={t("allowedDomainsHint")}>
          <Input id="security-domains" value={domains} onChange={(event) => setDomains(event.target.value)} placeholder="acme.com, subsidiary.acme.com" disabled={!isOwner} />
        </FormField>
        <FormField label={t("reauthWindow")} htmlFor="security-reauth">
          <Input id="security-reauth" type="number" min={5} max={60} value={reauthMinutes} onChange={(event) => setReauthMinutes(event.target.value)} disabled={!isOwner} />
        </FormField>
      </div>
      <SettingRows className="-mx-6 border-t border-hairline [&>[data-slot=setting-row]]:px-6">
        <SettingRow
          title={t("suspiciousSession")}
          description={t("suspiciousSessionHint")}
          htmlFor="security-risk"
          control={<Switch id="security-risk" checked={risk} onCheckedChange={setRisk} disabled={!isOwner} />}
        />
        <SettingRow
          title={t("requirePasskey")}
          description={t("requirePasskeyHint")}
          htmlFor="security-passkey"
          control={<Switch id="security-passkey" checked={requirePasskey} onCheckedChange={setRequirePasskey} disabled={!isOwner} />}
        />
      </SettingRows>
      {isOwner ? <Button onClick={save} disabled={pending}>{pending ? t("saving") : t("save")}</Button> : <p className="text-[12.5px] text-soft-ink">{t("ownersOnly")}</p>}
    </Card>
  );
}
