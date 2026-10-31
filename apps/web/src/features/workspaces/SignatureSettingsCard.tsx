"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import { PencilIcon } from "@/components/ui/icons/phosphor";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { FormFooter } from "@/components/ui/form-footer";
import { SettingRow, SettingRows } from "@/components/ui/setting-row";
import { Input } from "@/components/ui/input";
import { saveSignatureSettings } from "./signature-settings-actions";
import {
  deleteSavedSignature,
  listSavedSignatures,
} from "@/features/documents/saved-signature-actions";
import { SavedVectorThumb } from "@/features/documents/VectorSignaturePreview";

type Settings = {
  nativeSignEnabled: boolean;
  remoteSignEnabled: boolean;
  savedSignaturesEnabled: boolean;
  vectorSignaturesEnabled: boolean;
  signatureOtpEnabled: boolean;
  signatureTimelineEnabled: boolean;
  signatureSecurityMode: string;
  signatureExpirationDays: number;
};

type SavedSignature =
  | { id: string; createdAt: Date; kind: "png"; dataUrl: string }
  | { id: string; createdAt: Date; kind: "vector"; vectorData: string };

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
  const [saved, setSaved] = useState(settings);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const [pending, startTransition] = useTransition();

  function toggle(key: keyof Settings) {
    setValue((current) => ({ ...current, [key]: !current[key] }));
  }

  function save() {
    startTransition(async () => {
      const result = await saveSignatureSettings(value);
      if (!result.ok) toast.error(result.error);
      else {
        setSaved(value);
        toast.success("Signature settings saved");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="gap-5 p-6">
        <SectionHeader
          icon={PencilIcon}
          title="Harly Signature"
          description="Control which native signing capabilities are available to this workspace. Native signing is compliance-ready and does not replace your legal policies."
          badge={
            <StatusPill tone={value.nativeSignEnabled ? "on" : "off"}>
              {value.nativeSignEnabled ? "Active" : "Disabled"}
            </StatusPill>
          }
        />

        <SettingRows className="-mx-6 border-t border-hairline [&>[data-slot=setting-row]]:px-6">
          {TOGGLES.map((item) => (
            <SettingRow
              key={item.key}
              htmlFor={`signature-${item.key}`}
              descriptionId={`signature-${item.key}-desc`}
              title={item.title}
              description={item.description}
              control={
                <Switch
                  id={`signature-${item.key}`}
                  aria-describedby={`signature-${item.key}-desc`}
                  checked={value[item.key]}
                  onCheckedChange={() => toggle(item.key)}
                />
              }
            />
          ))}
          <SettingRow
            htmlFor="signature-otp"
            descriptionId="signature-otp-desc"
            title="Require email OTP for remote signing"
            description="Recipients must verify a one-time code sent to their email before signing a remote link."
            control={
              <Switch
                id="signature-otp"
                aria-describedby="signature-otp-desc"
                checked={value.signatureOtpEnabled}
                onCheckedChange={() => toggle("signatureOtpEnabled")}
              />
            }
          />
          <SettingRow
            htmlFor="signature-expiration"
            descriptionId="signature-expiration-desc"
            title="Remote link expiration (days)"
            description="Default is 30 days. Maximum is 365 days."
            control={
              <Input
                id="signature-expiration"
                aria-describedby="signature-expiration-desc"
                className="w-24"
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
            }
          />
        </SettingRows>

        <FormFooter
          className="-mx-6 -mb-6 border-t"
          dirty={dirty}
          saving={pending}
          saveLabel="Save settings"
          onDiscard={() => setValue(saved)}
          onSave={save}
        />
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
      .then((rows) => setSignatures(rows))
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
                  {signature.kind === "vector" ? (
                    <SavedVectorThumb vectorData={signature.vectorData} />
                  ) : (
                    <img
                      src={signature.dataUrl}
                      alt="Saved signature"
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
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
