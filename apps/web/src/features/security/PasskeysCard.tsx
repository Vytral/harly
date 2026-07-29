"use client";

import { useState, useTransition } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { toast } from "@/lib/notification-island/toast";
import { formatDistanceToNow } from "date-fns";

import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import {
  FingerPrintDuotoneIcon,
  TrashIcon,
  PlusIcon,
  SpinnerIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deletePasskeyAction } from "@/features/security/actions";

type PasskeyView = {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export function PasskeysCard({
  initialPasskeys,
}: {
  initialPasskeys: PasskeyView[];
}) {
  const [passkeyList, setPasskeyList] = useState(initialPasskeys);
  const [adding, setAdding] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [isPending, startTransition] = useTransition();

  async function handleRegister() {
    startTransition(async () => {
      try {
        // 1. Get registration options from server
        const optRes = await fetch("/api/passkey/register");
        if (!optRes.ok) throw new Error("Failed to get registration options");
        const options = await optRes.json();

        // 2. Browser creates credential
        const attestation = await startRegistration({ optionsJSON: options });

        // 3. Send to server for verification & storage
        const verRes = await fetch("/api/passkey/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response: attestation, name: passkeyName || "Passkey" }),
        });

        if (!verRes.ok) {
          const err = await verRes.json();
          throw new Error(err.error ?? "Registration failed");
        }

        toast.success("Passkey registered successfully");
        setAdding(false);
        setPasskeyName("");

        // Refresh list
        const newKey: PasskeyView = {
          id: crypto.randomUUID(),
          name: passkeyName || "Passkey",
          deviceType: "singleDevice",
          backedUp: false,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        };
        setPasskeyList((prev) => [...prev, newKey]);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotAllowedError") {
          // User dismissed the browser dialog , not an error.
          return;
        }
        toast.error(
          err instanceof Error ? err.message : "Failed to register passkey",
        );
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deletePasskeyAction(id);
      setPasskeyList((prev) => prev.filter((p) => p.id !== id));
      toast.success("Passkey removed");
    });
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={FingerPrintDuotoneIcon}
        title="Passkeys"
        description="Sign in with biometrics or a hardware security key. No password required."
        badge={
          <StatusPill tone={passkeyList.length > 0 ? "on" : "neutral"}>
            {passkeyList.length === 0
              ? "None registered"
              : `${passkeyList.length} passkey${passkeyList.length > 1 ? "s" : ""}`}
          </StatusPill>
        }
        action={
          !adding ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <PlusIcon className="mr-1.5 size-3.5" />
              Add passkey
            </Button>
          ) : null
        }
      />

      {/* Add passkey form */}
      {adding && (
        <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            Name this passkey so you can identify it later (e.g. &ldquo;MacBook&rdquo; or
            &ldquo;iPhone 15&rdquo;).
          </p>
          <div className="space-y-2">
            <Label htmlFor="passkey-name">Passkey name</Label>
            <Input
              id="passkey-name"
              value={passkeyName}
              onChange={(e) => setPasskeyName(e.target.value)}
              placeholder="My MacBook"
              maxLength={50}
              onKeyDown={(e) => e.key === "Enter" && handleRegister()}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleRegister}
              disabled={isPending}
            >
              {isPending ? (
                <SpinnerIcon className="mr-1.5 size-3.5" />
              ) : (
                <FingerPrintDuotoneIcon className="mr-1.5 size-3.5" />
              )}
              Register passkey
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setAdding(false); setPasskeyName(""); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Passkey list */}
      {passkeyList.length > 0 && (
        <div className="space-y-2">
          {passkeyList.map((pk) => (
            <div
              key={pk.id}
              className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FingerPrintDuotoneIcon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{pk.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pk.deviceType === "multiDevice" ? "Synced" : "Device-bound"}
                    {pk.backedUp ? " · backed up" : ""}
                    {" · added "}
                    {formatDistanceToNow(new Date(pk.createdAt), {
                      addSuffix: true,
                    })}
                    {pk.lastUsedAt
                      ? ` · last used ${formatDistanceToNow(new Date(pk.lastUsedAt), { addSuffix: true })}`
                      : ""}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(pk.id)}
                disabled={isPending}
              >
                <TrashIcon className="size-4" />
                <span className="sr-only">Remove</span>
              </Button>
            </div>
          ))}
        </div>
      )}

      {passkeyList.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          No passkeys yet. Add one to enable passwordless sign-in on this
          device.
        </p>
      )}
    </Card>
  );
}
