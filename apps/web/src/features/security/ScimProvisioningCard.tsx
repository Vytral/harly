"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import { createScimTokenAction, revokeScimTokenAction, type ScimTokenSummary } from "@/features/security/scim-actions";

export function ScimProvisioningCard({ tokens, workspaceId, isOwner }: { tokens: ScimTokenSummary[]; workspaceId: string; isOwner: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function create() {
    startTransition(async () => {
      const result = await createScimTokenAction({ name, expiresAt: expiresAt || undefined });
      if (!result.ok) {
        toast.error(result.error ?? "Could not create token.");
        return;
      }
      setName(""); setExpiresAt(""); setNewToken(result.token ?? null); router.refresh();
      toast.success("SCIM token created. Copy it now; it will not be shown again.");
    });
  }
  return (
    <Card className="gap-5 p-6">
      <SectionHeader icon={KeyRound} title="SCIM provisioning" description="Provision and deactivate members automatically from your identity provider." badge={<StatusPill tone={tokens.some((t) => !t.revokedAt) ? "on" : "off"}>{tokens.some((t) => !t.revokedAt) ? "Configured" : "Not configured"}</StatusPill>} />
      <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
        Endpoint: <code className="text-foreground">/api/scim/v2.0/{workspaceId}/Users</code>
      </div>
      {newToken ? (
        <div className="space-y-2 rounded-xl border border-clay/30 bg-clay/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-clay"><ShieldAlert className="size-4" />Copy this token now</div>
          <div className="flex gap-2"><Input readOnly value={newToken} className="font-mono text-xs" /><Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(newToken); toast.success("Token copied."); }}><Copy className="size-4" /></Button></div>
        </div>
      ) : null}
      {isOwner ? <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <div className="space-y-2"><Label htmlFor="scim-token-name">Token name</Label><Input id="scim-token-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Okta production" /></div>
        <div className="space-y-2"><Label htmlFor="scim-token-expiry">Expires</Label><Input id="scim-token-expiry" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></div>
        <Button type="button" onClick={create} disabled={pending || !name.trim()}><Plus className="size-4" />Create token</Button>
      </div> : null}
      <div className="divide-y rounded-xl border border-border/70">
      {tokens.map((token) => <div key={token.id} className="flex items-center gap-3 px-4 py-3 text-sm"><span className="min-w-0 flex-1"><span className="font-medium">{token.name}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{token.tokenPrefix}…</span><span className="block text-xs text-muted-foreground">{token.revokedAt ? "Revoked" : token.lastUsedAt ? `Last used ${token.lastUsedAt.toLocaleString()}` : "Never used"}</span></span>{isOwner && !token.revokedAt ? <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Revoke ${token.name}`} onClick={() => startTransition(async () => { const result = await revokeScimTokenAction(token.id); if (!result.ok) { toast.error(result.error); return; } toast.success("SCIM token revoked."); router.refresh(); })}><Trash2 className="size-4" /></Button> : null}</div>)}
        {tokens.length === 0 ? <p className="px-4 py-5 text-sm text-muted-foreground">No SCIM tokens have been created.</p> : null}
      </div>
    </Card>
  );
}
