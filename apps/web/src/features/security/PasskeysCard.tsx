"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { startRegistration } from "@simplewebauthn/browser";
import { toast } from "@/lib/notification-island/toast";
import { formatDistanceToNow } from "date-fns";
import { dateFnsLocale } from "@/lib/date-fns-locale";
import { randomId } from "@/lib/utils";

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
import { DemoLockedNotice } from "@/features/demo/DemoLockedNotice";

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
  demoLocked = false,
}: {
  initialPasskeys: PasskeyView[];
  demoLocked?: boolean;
}) {
  const [passkeyList, setPasskeyList] = useState(initialPasskeys);
  const [adding, setAdding] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const t = useTranslations("features.security.passkeysCard");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  async function handleRegister() {
    if (demoLocked) return;
    startTransition(async () => {
      try {
        // 1. Get registration options from server
        const optRes = await fetch("/api/passkey/register");
        if (!optRes.ok) throw new Error(t("errors.optionsFailed"));
        const { challengeId, ...options } = await optRes.json();

        // 2. Browser creates credential
        const attestation = await startRegistration({ optionsJSON: options });

        // 3. Send to server for verification & storage
        const verRes = await fetch("/api/passkey/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId, response: attestation, name: passkeyName || "Passkey" }),
        });

        if (!verRes.ok) {
          const err = await verRes.json();
          throw new Error(err.error ?? t("errors.registrationFailed"));
        }

        toast.success(t("toasts.registered"));
        setAdding(false);
        setPasskeyName("");

        // Refresh list
        const newKey: PasskeyView = {
          id: randomId(),
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
          err instanceof Error ? err.message : t("errors.registerFailed"),
        );
      }
    });
  }

  function handleDelete(id: string) {
    if (demoLocked) return;
    startTransition(async () => {
      await deletePasskeyAction(id);
      setPasskeyList((prev) => prev.filter((p) => p.id !== id));
      toast.success(t("toasts.removed"));
    });
  }

  return (
    <Card className="gap-5 p-6">
      {demoLocked ? (
        <DemoLockedNotice>
          {t("demoLocked")}
        </DemoLockedNotice>
      ) : null}
      <SectionHeader
        icon={FingerPrintDuotoneIcon}
        title={t("title")}
        description={t("description")}
        badge={
          <StatusPill tone={passkeyList.length > 0 ? "on" : "neutral"}>
            {passkeyList.length === 0
              ? t("noneRegistered")
              : t("passkeyCount", { count: passkeyList.length })}
          </StatusPill>
        }
        action={
          !demoLocked && !adding ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <PlusIcon className="mr-1.5 size-3.5" />
              {t("addPasskey")}
            </Button>
          ) : null
        }
      />

      {/* Add passkey form */}
      {adding && (
        <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            {t("nameHint")}
          </p>
          <div className="space-y-2">
            <Label htmlFor="passkey-name">{t("nameLabel")}</Label>
            <Input
              id="passkey-name"
              value={passkeyName}
              onChange={(e) => setPasskeyName(e.target.value)}
              placeholder={t("namePlaceholder")}
              maxLength={50}
              onKeyDown={(e) => e.key === "Enter" && handleRegister()}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleRegister}
              disabled={demoLocked || isPending}
            >
              {isPending ? (
                <SpinnerIcon className="mr-1.5 size-3.5" />
              ) : (
                <FingerPrintDuotoneIcon className="mr-1.5 size-3.5" />
              )}
              {t("register")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setAdding(false); setPasskeyName(""); }}
            >
              {t("cancel")}
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
              className="flex items-center justify-between gap-4 rounded-[var(--radius-inner)] bg-card-inset px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FingerPrintDuotoneIcon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{pk.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("meta", {
                      deviceType:
                        pk.deviceType === "multiDevice"
                          ? t("deviceTypes.synced")
                          : t("deviceTypes.deviceBound"),
                      backedUp: pk.backedUp ? "yes" : "no",
                      addedAgo: formatDistanceToNow(new Date(pk.createdAt), {
                        addSuffix: true,
                        locale: dateFnsLocale(locale),
                      }),
                      hasLastUsed: pk.lastUsedAt ? "yes" : "no",
                      lastUsedAgo: pk.lastUsedAt
                        ? formatDistanceToNow(new Date(pk.lastUsedAt), { addSuffix: true, locale: dateFnsLocale(locale) })
                        : "",
                    })}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(pk.id)}
                disabled={demoLocked || isPending}
              >
                <TrashIcon className="size-4" />
                <span className="sr-only">{t("remove")}</span>
              </Button>
            </div>
          ))}
        </div>
      )}

      {passkeyList.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          {t("noPasskeys")}
        </p>
      )}
    </Card>
  );
}
