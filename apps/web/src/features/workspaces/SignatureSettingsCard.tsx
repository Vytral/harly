"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import { SealCheckDuotoneIcon } from "@/components/ui/icons/phosphor";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSignatureSettings } from "./signature-settings-actions";
import {
  deleteSavedSignature,
  listSavedSignatures,
} from "@/features/documents/saved-signature-actions";

type Settings = {
  nativeSignEnabled: boolean;
  remoteSignEnabled: boolean;
  savedSignaturesEnabled: boolean;
  signatureOtpEnabled: boolean;
  signatureTimelineEnabled: boolean;
  signatureSecurityMode: string;
  signatureExpirationDays: number;
};

type SavedSignature = { id: string; createdAt: Date; dataUrl: string };

const TOGGLES: Array<{
  key: "nativeSignEnabled" | "remoteSignEnabled" | "savedSignaturesEnabled" | "signatureTimelineEnabled";
  title: string;
  description: string;
}> = [
  {
    key: "nativeSignEnabled",
    title: "Self-sign",
    description: "Let members draw or type a signature and sign PDFs directly in the dashboard.",
  },
  {
    key: "remoteSignEnabled",
    title: "Remote signing links",
    description: "Send a secure link so an external recipient can sign without an account.",
  },
  {
    key: "savedSignaturesEnabled",
    title: "Saved signatures",
    description: "Let members reuse a saved signature instead of drawing one each time.",
  },
  {
    key: "signatureTimelineEnabled",
    title: "Signing timeline",
    description: "Show the audit timeline (viewed, verified, signed) on signed documents.",
  },
];

export function SignatureSettingsCard({ settings }: { settings: Settings }) {
  const [value, setValue] = useState(settings);
  const [pending, startTransition] = useTransition();

  function toggle(key: keyof Settings) {
    setValue((current) => ({ ...current, [key]: !current[key] }));
  }

  function save() {
    startTransition(async () => {
      const result = await saveSignatureSettings(value);
      if (!result.ok) toast.error(result.error);
      else toast.success("Signature settings saved");
    });
  }

  return (
    <div className="space-y-6">
      <Card className="gap-5 p-6">
        <SectionHeader
          icon={SealCheckDuotoneIcon}
          title="Harly Signature"
          description="Control which native signing capabilities are available to this workspace. Native signing is compliance-ready and does not replace your legal policies."
          badge={
            <StatusPill tone={value.nativeSignEnabled ? "on" : "off"}>
              {value.nativeSignEnabled ? "Active" : "Disabled"}
            </StatusPill>
          }
        />

        <div className="divide-y divide-border/70 rounded-xl border border-border/70">
          {TOGGLES.map((item) => (
            <label
              key={item.key}
              className="flex items-start justify-between gap-4 px-4 py-3.5"
            >
              <span>
                <span className="block text-sm font-medium">{item.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {item.description}
                </span>
              </span>
              <Switch
                checked={value[item.key]}
                onCheckedChange={() => toggle(item.key)}
              />
            </label>
          ))}
          <label className="flex items-start justify-between gap-4 px-4 py-3.5">
            <span>
              <span className="block text-sm font-medium">
                Require email OTP for remote signing
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Recipients must verify a one-time code sent to their email before
                signing a remote link.
              </span>
            </span>
            <Switch
              checked={value.signatureOtpEnabled}
              onCheckedChange={() => toggle("signatureOtpEnabled")}
            />
          </label>
        </div>

        <div className="max-w-xs space-y-2">
          <Label htmlFor="signature-expiration">
            Remote link expiration (days)
          </Label>
          <Input
            id="signature-expiration"
            type="number"
            min={1}
            max={365}
            value={value.signatureExpirationDays}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                signatureExpirationDays: Number(event.target.value),
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Default is 30 days. Maximum is 365 days.
          </p>
        </div>

        <div>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </Card>

      {value.savedSignaturesEnabled ? <SavedSignaturesCard /> : null}
    </div>
  );
}

function SavedSignaturesCard() {
  const [signatures, setSignatures] = useState<SavedSignature[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listSavedSignatures()
      .then((rows) => setSignatures(rows as SavedSignature[]))
      .finally(() => setLoading(false));
  }, []);

  function remove(id: string) {
    void deleteSavedSignature({ id }).then((result) => {
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete the signature.");
        return;
      }
      setSignatures((current) => current.filter((item) => item.id !== id));
      toast.success("Signature removed");
    });
  }

  return (
    <Card className="gap-4 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Your saved signatures
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Signatures you save while signing a document appear here. They are
          private to your account and reusable across every document.
        </p>
      </div>
      <CardContent className="px-0">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : signatures.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm leading-6 text-muted-foreground">
            No saved signatures yet. Save one from the signing screen the next
            time you sign a document.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {signatures.map((signature) => (
              <div key={signature.id} className="group relative">
                <div className="flex h-20 items-center justify-center rounded-lg border border-input bg-white p-2">
                  <img
                    src={signature.dataUrl}
                    alt="Saved signature"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <button
                  type="button"
                  aria-label="Delete saved signature"
                  onClick={() => remove(signature.id)}
                  className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground opacity-0 shadow-xs transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
