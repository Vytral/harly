"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { toast } from "@/lib/notification-island/toast";
import { saveAssistantBrandingAction } from "@/features/workspaces/ai-settings-actions";
import {
  ASSISTANT_NAME_MAX,
  DEFAULT_ASSISTANT_NAME,
  type AssistantBranding,
} from "@/lib/ai/assistant-branding-shared";
import { AssistantAvatar } from "@/components/dashboard/HarlyAIContext";
import { Card } from "@/components/ui/card";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { FormFooter } from "@/components/ui/form-footer";
import { HarlyAILogoMark } from "@/components/ui/icons/HarlyAILogoMark";
import { Input } from "@/components/ui/input";
import { SettingRow, SettingRows, SettingSection } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type AvatarKind = AssistantBranding["assistantAvatar"]["kind"];

function Avatar({ url, size }: { url: string | null; size: number }) {
  return url ? (
    <AssistantAvatar avatarUrl={url} size={size} className="shrink-0 rounded-full" />
  ) : (
    <HarlyAILogoMark className="shrink-0" />
  );
}

/** Live preview: the launcher bubble and the panel header, as members will see them. */
function AssistantPreview({
  name,
  avatarUrl,
  showPoweredBy,
}: {
  name: string;
  avatarUrl: string | null;
  showPoweredBy: boolean;
}) {
  const t = useTranslations("features.workspaces.assistantBrandingCard");
  const label = name.trim() || DEFAULT_ASSISTANT_NAME;
  const poweredBy = showPoweredBy && label !== DEFAULT_ASSISTANT_NAME;
  return (
    <div
      role="group"
      aria-label={t("previewGroup", { name: label })}
      className="flex flex-wrap items-center gap-4 rounded-[var(--radius-inner)] bg-card-inset p-4"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-pure-snow text-near-ink shadow-[var(--shadow-float)] ring-1 ring-hairline">
        {avatarUrl ? (
          <AssistantAvatar avatarUrl={avatarUrl} size={28} className="size-7 rounded-full" />
        ) : (
          <HarlyAILogoMark className="size-7" />
        )}
      </span>
      <div className="min-w-0 flex-1 rounded-[var(--radius-btn)] border border-hairline bg-pure-snow px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {avatarUrl ? (
            <AssistantAvatar avatarUrl={avatarUrl} size={20} className="size-5 shrink-0 rounded-full" />
          ) : (
            <HarlyAILogoMark className="size-5 shrink-0" />
          )}
          <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-near-ink">
            {label}
          </span>
        </div>
        {poweredBy ? (
          <p className="mt-1 text-[11px] leading-none text-quiet-mist">{t("poweredBy")}</p>
        ) : null}
      </div>
    </div>
  );
}

export function AssistantBrandingCard({
  branding,
  canEdit,
}: {
  branding: AssistantBranding;
  canEdit: boolean;
}) {
  const t = useTranslations("features.workspaces.assistantBrandingCard");
  const router = useRouter();
  const nameId = useId();
  const nameHintId = useId();
  const [saving, startSave] = useTransition();

  const initialUrl =
    branding.assistantAvatar.kind === "upload" ? branding.assistantAvatar.url : "";
  const [name, setName] = useState(branding.assistantName);
  const [kind, setKind] = useState<AvatarKind>(branding.assistantAvatar.kind);
  const [uploadUrl, setUploadUrl] = useState(initialUrl);
  const [showPoweredBy, setShowPoweredBy] = useState(branding.showPoweredBy);

  const trimmedName = name.trim();
  const avatarUrl = kind === "upload" && uploadUrl ? uploadUrl : null;
  const missingUpload = kind === "upload" && !uploadUrl;
  const invalid = !trimmedName || missingUpload;
  const dirty =
    trimmedName !== branding.assistantName ||
    kind !== branding.assistantAvatar.kind ||
    (kind === "upload" && uploadUrl !== initialUrl) ||
    showPoweredBy !== branding.showPoweredBy;

  function discard() {
    setName(branding.assistantName);
    setKind(branding.assistantAvatar.kind);
    setUploadUrl(initialUrl);
    setShowPoweredBy(branding.showPoweredBy);
  }

  function save() {
    startSave(async () => {
      const result = await saveAssistantBrandingAction({
        assistantName: trimmedName,
        assistantAvatar:
          kind === "upload" && uploadUrl
            ? { kind: "upload", url: uploadUrl }
            : { kind: "harly" },
        showPoweredBy,
      });
      if (!result.ok) {
        toast.error(result.error ?? t("saveFailed"));
        return;
      }
      toast.success(t("saved"));
      router.refresh();
    });
  }

  const disabled = !canEdit || saving;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <SettingSection
        title={t("title")}
        description={t("description")}
      />
      <SettingRows>
        <SettingRow
          title={t("name")}
          description={t("nameDescription", { max: ASSISTANT_NAME_MAX })}
          htmlFor={nameId}
          descriptionId={nameHintId}
          control={
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={ASSISTANT_NAME_MAX}
              placeholder={DEFAULT_ASSISTANT_NAME}
              disabled={disabled}
              aria-describedby={nameHintId}
              aria-invalid={!trimmedName}
              className="w-full sm:w-64"
            />
          }
        />
        <SettingRow
          title={t("avatar")}
          description={t("avatarDescription")}
          align="start"
          control={
            <div
              role="radiogroup"
              aria-label={t("avatar")}
              className="inline-flex rounded-[var(--radius-btn)] bg-card-inset p-1"
            >
              {(
                [
                  { value: "harly", label: t("harlyMark") },
                  { value: "upload", label: t("upload") },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === option.value}
                  disabled={disabled}
                  onClick={() => setKind(option.value)}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink disabled:cursor-not-allowed disabled:opacity-60",
                    kind === option.value
                      ? "bg-pure-snow text-near-ink shadow-[var(--shadow-card)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          }
        >
          {kind === "upload" ? (
            <div className="mt-3 flex items-center gap-4">
              <FileDropzone
                value={uploadUrl || null}
                onChange={(url) => setUploadUrl(url ?? "")}
                variant="avatar"
                disabled={disabled}
                hint={t("dropzoneHint")}
              />
              <div className="flex items-center gap-3">
                <Avatar url={uploadUrl || null} size={40} />
                {uploadUrl ? (
                  <button
                    type="button"
                    onClick={() => setUploadUrl("")}
                    disabled={disabled}
                    className="text-[13px] font-medium text-soft-ink underline-offset-2 hover:text-near-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink disabled:opacity-60"
                  >
                    {t("removeImage")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </SettingRow>
        <SettingRow
          title={t("poweredByTitle")}
          description={t("poweredByDescription")}
          control={
            <Switch
              checked={showPoweredBy}
              onCheckedChange={setShowPoweredBy}
              disabled={disabled}
              aria-label={t("poweredByAriaLabel")}
            />
          }
        />
        <div className="px-5 py-4">
          <p className="mb-2 text-[12.5px] font-medium text-soft-ink">{t("preview")}</p>
          <AssistantPreview
            name={name}
            avatarUrl={avatarUrl}
            showPoweredBy={showPoweredBy}
          />
        </div>
      </SettingRows>
      {canEdit ? (
        <FormFooter
          dirty={dirty}
          saving={saving}
          disabled={invalid}
          onDiscard={discard}
          onSave={save}
          hint={
            missingUpload
              ? t("missingUpload")
              : undefined
          }
        />
      ) : null}
    </Card>
  );
}
