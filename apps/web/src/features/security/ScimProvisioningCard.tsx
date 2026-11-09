"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";
import { Copy, KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import { createScimTokenAction, revokeScimTokenAction, type ScimTokenSummary } from "@/features/security/scim-actions";
import { copyText } from "@/lib/utils";

export function ScimProvisioningCard({ tokens, workspaceId, isOwner }: { tokens: ScimTokenSummary[]; workspaceId: string; isOwner: boolean }) {
  const router = useRouter();
  const t = useTranslations("features.security.scimProvisioningCard");
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function create() {
    startTransition(async () => {
      const result = await createScimTokenAction({ name, expiresAt: expiresAt || undefined });
      if (!result.ok) {
        toast.error(result.error ?? t("errors.createFailed"));
        return;
      }
      setName(""); setExpiresAt(""); setNewToken(result.token ?? null); router.refresh();
      toast.success(t("toasts.created"));
    });
  }
  return (
    <Card className="gap-5 p-6">
      <SectionHeader icon={KeyRound} title={t("title")} description={t("description")} badge={<StatusPill tone={tokens.some((token) => !token.revokedAt) ? "on" : "off"}>{tokens.some((token) => !token.revokedAt) ? t("configured") : t("notConfigured")}</StatusPill>} />
      <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
        {t.rich("endpoint", { workspaceId, code: (chunks) => <code className="text-foreground">{chunks}</code> })}
      </div>
      {newToken ? (
        <div className="space-y-2 rounded-xl border border-clay/30 bg-clay/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-clay"><ShieldAlert className="size-4" />{t("copyNow")}</div>
          <div className="flex gap-2"><Input readOnly value={newToken} className="font-mono text-xs" /><Button type="button" variant="outline" aria-label={t("copyTokenLabel")} title={t("copyTokenLabel")} onClick={() => { void copyText(newToken); toast.success(t("toasts.copied")); }}><Copy className="size-4" /></Button></div>
        </div>
      ) : null}
      {isOwner ? <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <div className="space-y-2"><Label htmlFor="scim-token-name">{t("tokenName")}</Label><Input id="scim-token-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("tokenNamePlaceholder")} /></div>
        <div className="space-y-2"><Label htmlFor="scim-token-expiry">{t("expires")}</Label><Input id="scim-token-expiry" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></div>
        <Button type="button" onClick={create} disabled={pending || !name.trim()}><Plus className="size-4" />{t("createToken")}</Button>
      </div> : null}
      <div className="divide-y rounded-xl border border-border/70">
      {tokens.map((token) => <div key={token.id} className="flex items-center gap-3 px-4 py-3 text-sm"><span className="min-w-0 flex-1"><span className="font-medium">{token.name}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{token.tokenPrefix}…</span><span className="block text-xs text-muted-foreground">{token.revokedAt ? t("revoked") : token.lastUsedAt ? t("lastUsed", { date: token.lastUsedAt.toLocaleString() }) : t("neverUsed")}</span></span>{isOwner && !token.revokedAt ? <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={t("revokeLabel", { name: token.name })} onClick={() => startTransition(async () => { const result = await revokeScimTokenAction(token.id); if (!result.ok) { toast.error(result.error); return; } toast.success(t("toasts.revoked")); router.refresh(); })}><Trash2 className="size-4" /></Button> : null}</div>)}
        {tokens.length === 0 ? <p className="px-4 py-5 text-sm text-muted-foreground">{t("emptyState")}</p> : null}
      </div>
    </Card>
  );
}
