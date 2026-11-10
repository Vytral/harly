"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
  signatureReminderCadenceDays: number;
  signatureMaxReminders: number;
};

type SavedSignature =
  | { id: string; createdAt: Date; kind: "png"; dataUrl: string }
  | { id: string; createdAt: Date; kind: "vector"; vectorData: string };

const TOGGLES: Array<{
  key: "nativeSignEnabled" | "remoteSignEnabled" | "savedSignaturesEnabled" | "signatureTimelineEnabled";
}> = [
  { key: "nativeSignEnabled" },
  { key: "remoteSignEnabled" },
  { key: "savedSignaturesEnabled" },
  { key: "signatureTimelineEnabled" },
];

export function SignatureSettingsCard({ settings }: { settings: Settings }) {
  const t = useTranslations("features.workspaces.signatureSettingsCard");
  const [value, setValue] = useState(settings);
  const [saved, setSaved] = useState(settings);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const [pending, startTransition] = useTransition();

  function toggle(key: keyof Settings) {
    setValue((current) => ({ ...current, [key]: !current[key] }));
  }

  function setNumber(key: "signatureExpirationDays" | "signatureReminderCadenceDays" | "signatureMaxReminders", raw: string) {
    // Keep an empty box empty while typing instead of snapping it to 0.
    setValue((current) => ({ ...current, [key]: raw === "" ? (Number.NaN as number) : Number(raw) }));
  }

  function save() {
    const { signatureExpirationDays: days, signatureReminderCadenceDays: cadence, signatureMaxReminders: max } = value;
    if (!Number.isInteger(days) || days < 3 || days > 365) return void toast.error(t("linkLifetimeRange", { min: 3, max: 365 }));
    if (!Number.isInteger(cadence) || cadence < 0 || cadence > 30) return void toast.error(t("reminderIntervalRange", { min: 0, max: 30 }));
    if (!Number.isInteger(max) || max < 0 || max > 10) return void toast.error(t("maxRemindersRange", { min: 0, max: 10 }));
    startTransition(async () => {
      const result = await saveSignatureSettings(value);
      if (!result.ok) toast.error(result.error);
      else {
        setSaved(value);
        toast.success(t("saved"));
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="gap-5 p-6">
        <SectionHeader
          icon={PencilIcon}
          title="Harly Signature"
          description={t("description")}
          badge={
            <StatusPill tone={value.nativeSignEnabled ? "on" : "off"}>
              {value.nativeSignEnabled ? t("active") : t("disabled")}
            </StatusPill>
          }
        />

        <SettingRows className="-mx-6 border-t border-hairline [&>[data-slot=setting-row]]:px-6">
          {TOGGLES.map((item) => (
            <SettingRow
              key={item.key}
              htmlFor={`signature-${item.key}`}
              descriptionId={`signature-${item.key}-desc`}
              title={t(`toggles.${item.key}.title`)}
              description={t(`toggles.${item.key}.description`)}
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
            title={t("requireOtp")}
            description={t("requireOtpDescription")}
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
            title={t("linkLifetime")}
            description={t("linkLifetimeDescription")}
            control={
              <Input
                id="signature-expiration"
                aria-describedby="signature-expiration-desc"
                className="w-24"
                type="number"
                min={3}
                max={365}
                value={Number.isNaN(value.signatureExpirationDays) ? "" : value.signatureExpirationDays}
                onChange={(event) => setNumber("signatureExpirationDays", event.target.value)}
              />
            }
          />
          <SettingRow
            htmlFor="signature-reminder-cadence"
            descriptionId="signature-reminder-cadence-desc"
            title={t("reminderCadence")}
            description={t("reminderCadenceDescription")}
            control={
              <Input
                id="signature-reminder-cadence"
                aria-describedby="signature-reminder-cadence-desc"
                className="w-24"
                type="number"
                min={0}
                max={30}
                value={Number.isNaN(value.signatureReminderCadenceDays) ? "" : value.signatureReminderCadenceDays}
                onChange={(event) => setNumber("signatureReminderCadenceDays", event.target.value)}
              />
            }
          />
          <SettingRow
            htmlFor="signature-max-reminders"
            descriptionId="signature-max-reminders-desc"
            title={t("maxReminders")}
            description={t("maxRemindersDescription")}
            control={
              <Input
                id="signature-max-reminders"
                aria-describedby="signature-max-reminders-desc"
                className="w-24"
                type="number"
                min={0}
                max={10}
                value={Number.isNaN(value.signatureMaxReminders) ? "" : value.signatureMaxReminders}
                onChange={(event) => setNumber("signatureMaxReminders", event.target.value)}
              />
            }
          />
        </SettingRows>

        <FormFooter
          className="-mx-6 -mb-6 border-t"
          dirty={dirty}
          saving={pending}
          saveLabel={t("saveSettings")}
          onDiscard={() => setValue(saved)}
          onSave={save}
        />
      </Card>

      {value.savedSignaturesEnabled ? <SavedSignaturesCard /> : null}
    </div>
  );
}

function SavedSignaturesCard() {
  const t = useTranslations("features.workspaces.savedSignaturesCard");
  const [signatures, setSignatures] = useState<SavedSignature[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listSavedSignatures()
      .then((rows) => setSignatures(rows))
      .finally(() => setLoading(false));
  }, []);

  function remove(id: string) {
    if (!window.confirm(t("removeConfirm"))) return;
    void deleteSavedSignature({ id }).then((result) => {
      if (!result.ok) {
        toast.error(result.error ?? t("deleteError"));
        return;
      }
      setSignatures((current) => current.filter((item) => item.id !== id));
      toast.success(t("removed"));
    });
  }

  return (
    <Card className="gap-4 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("title")}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>
      <CardContent className="px-0">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-[var(--radius-inner)] bg-card-inset"
              />
            ))}
          </div>
        ) : signatures.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm leading-6 text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {signatures.map((signature) => (
              <div key={signature.id} className="group relative">
                <div className="flex h-20 items-center justify-center rounded-[var(--radius-inner)] border border-hairline bg-white p-2">
                  {signature.kind === "vector" ? (
                    <SavedVectorThumb vectorData={signature.vectorData} />
                  ) : (
                    <img
                      src={signature.dataUrl}
                      alt={t("savedSignatureAlt")}
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t("deleteSignature")}
                  onClick={() => remove(signature.id)}
                  className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-xs transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
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
