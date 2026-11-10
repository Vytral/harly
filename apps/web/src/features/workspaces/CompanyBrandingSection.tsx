"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/notification-island/toast";

import {
  updateWorkspaceBoardBrandingAction,
  updateWorkspaceProfileAction,
} from "@/features/workspaces/actions";
import {
  DEFAULT_BOARD_PRIMARY_COLOR,
  type LogoStyle,
} from "@/features/workspaces/board";
import type { WorkspaceBranding } from "@/features/workspaces/data";
import type { WorkspaceRole } from "@/features/workspaces/roles";
import { SectionHeader } from "@/features/workspaces/settings-ui";
import { FileDropzone } from "@/components/ui/FileDropzone";
import {
  ArrowUpRightIcon,
  PaletteDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { BuildingsIcon } from "@/components/ui/icons/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const initialActionState = { success: false } as {
  success: boolean;
  error?: string;
};

function useActionToast(
  state: { success: boolean; error?: string },
  successMessage: string,
) {
  const previous = useRef(state);
  useEffect(() => {
    if (state === previous.current) return;
    previous.current = state;
    if (state.success) toast.success(successMessage);
    else if (state.error) toast.error(state.error);
  }, [state, successMessage]);
}

type SegmentedOption<T extends string> = { value: T; label: string };

function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-[var(--radius-btn)] bg-card-inset p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[var(--radius-sm)] px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            value === option.value
              ? "bg-pure-snow text-near-ink shadow-[var(--shadow-card)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CompanyBrandingSection({
  workspace,
  currentRole,
  afterIdentity,
}: {
  workspace: WorkspaceBranding;
  currentRole: WorkspaceRole;
  /** Rendered between Identity and Brand on small screens (see grid order). */
  afterIdentity?: React.ReactNode;
}) {
  const canEdit = currentRole === "owner" || currentRole === "admin";
  const t = useTranslations("features.workspaces.companyBrandingSection");

  const [profileState, profileAction, savingProfile] = useActionState(
    updateWorkspaceProfileAction,
    initialActionState,
  );
  const [brandingState, brandingAction, savingBranding] = useActionState(
    updateWorkspaceBoardBrandingAction,
    initialActionState,
  );
  useActionToast(profileState, t("identitySaved"));
  useActionToast(brandingState, t("brandSaved"));

  const identityFormRef = useRef<HTMLFormElement>(null);
  const shouldAutoSaveLogo = useRef(false);

  const [name, setName] = useState(workspace.name);
  const [logoUrl, setLogoUrl] = useState(workspace.logoUrl ?? "");

  // Auto-save only after an actual uploader interaction. Tracking the intent
  // separately from logoUrl avoids submitting on the initial render (and on
  // React StrictMode's development-only effect replay).
  useEffect(() => {
    if (!shouldAutoSaveLogo.current) return;
    shouldAutoSaveLogo.current = false;
    identityFormRef.current?.requestSubmit();
  }, [logoUrl]);
  const [tagline, setTagline] = useState(workspace.tagline ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(workspace.websiteUrl ?? "");
  const [heroImageUrl, setHeroImageUrl] = useState(workspace.heroImageUrl ?? "");
  const [primaryColor, setPrimaryColor] = useState(
    workspace.primaryColor ?? DEFAULT_BOARD_PRIMARY_COLOR,
  );
  const [sidebarLogoStyle, setSidebarLogoStyle] = useState<LogoStyle>(
    workspace.sidebarLogoStyle,
  );
  const [sidebarLogoUrl, setSidebarLogoUrl] = useState(
    workspace.sidebarLogoUrl ?? "",
  );
  const [sidebarLogoDarkUrl, setSidebarLogoDarkUrl] = useState(
    workspace.sidebarLogoDarkUrl ?? "",
  );
  const [hideHarlyBranding, setHideHarlyBranding] = useState(
    workspace.hideHarlyBranding,
  );
  const [timezone, setTimezone] = useState(workspace.timezone ?? "UTC");
  const timezoneOptions = useMemo(() => {
    const zones = typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
    return [...new Set(["UTC", ...zones, timezone])];
  }, [timezone]);

  const previewColor = /^#[0-9a-fA-F]{6}$/.test(primaryColor)
    ? primaryColor
    : DEFAULT_BOARD_PRIMARY_COLOR;

  return (
    <div className="grid w-full gap-6 lg:grid-cols-2 items-start">
      {/* ── Identity ─────────────────────────────────────────────────── */}
      <Card className="order-1 gap-6 p-6 sm:p-8">
        <SectionHeader
          icon={BuildingsIcon}
          title={t("identityTitle")}
          description={t("identityDescription")}
        />

        <form
          ref={identityFormRef}
          action={profileAction}
          className="space-y-6"
        >
          <input type="hidden" name="logoUrl" value={logoUrl} />
          <input type="hidden" name="sidebarLogoStyle" value={sidebarLogoStyle} />
          <input type="hidden" name="sidebarLogoUrl" value={sidebarLogoUrl} />
          <input
            type="hidden"
            name="sidebarLogoDarkUrl"
            value={sidebarLogoDarkUrl}
          />

          {/* Logo + name */}
          <div className="flex items-center gap-5">
            <FileDropzone
              value={logoUrl || null}
              onChange={(url) => {
                shouldAutoSaveLogo.current = true;
                setLogoUrl(url ?? "");
              }}
              variant="avatar"
              disabled={!canEdit || savingProfile}
              hint={t("logoHint")}
            />
            <div className="flex-1 space-y-2">
              <Label htmlFor="ws-name">{t("companyName")}</Label>
              <Input
                id="ws-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canEdit || savingProfile}
              />
              <p className="text-xs text-muted-foreground">
                {t("companyNameHelp")}
              </p>
            </div>
          </div>

          {/* Reporting time zone */}
          <div className="space-y-2">
            <Label htmlFor="ws-timezone">{t("timeZone")}</Label>
            <Select
              value={timezone}
              onValueChange={setTimezone}
              disabled={!canEdit || savingProfile}
            >
              <SelectTrigger id="ws-timezone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {timezoneOptions.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="timezone" value={timezone} />
            <p className="text-xs text-muted-foreground">
              {t("timeZoneHelp")}
            </p>
          </div>

          {/* Sidebar logo */}
          <div className="space-y-3 border-t pt-6">
            <div className="space-y-1">
              <Label>{t("sidebarLogo")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("sidebarLogoHelp")}
              </p>
            </div>
            <Segmented
              options={[
                { value: "bordered", label: t("iconAndName") },
                { value: "full", label: t("fullLogo") },
              ]}
              value={sidebarLogoStyle}
              onChange={setSidebarLogoStyle}
              disabled={!canEdit || savingProfile}
            />

            {sidebarLogoStyle === "full" ? (
              <div className="grid gap-4 pt-1 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t("lightMode")}
                  </Label>
                  <FileDropzone
                    value={sidebarLogoUrl || null}
                    onChange={(url) => setSidebarLogoUrl(url ?? "")}
                    aspect="banner"
                    disabled={!canEdit}
                    hint={t("wideLogoHint")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t("darkMode")}
                  </Label>
                  <div className="rounded-2xl bg-zinc-950 p-2">
                    <FileDropzone
                      value={sidebarLogoDarkUrl || null}
                      onChange={(url) => setSidebarLogoDarkUrl(url ?? "")}
                      aspect="banner"
                      disabled={!canEdit}
                      hint={t("darkLogoHint")}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex justify-end border-t pt-6">
            <Button type="submit" disabled={!canEdit || savingProfile}>
              {savingProfile ? t("saving") : t("saveIdentity")}
            </Button>
          </div>
        </form>
      </Card>

      {/* Optional full-width card (Gravatar). Stacks right under Identity on
          small screens; on lg it spans both columns below Identity + Brand. */}
      {afterIdentity ? (
        <div className="order-2 min-w-0 lg:order-3 lg:col-span-2">{afterIdentity}</div>
      ) : null}

      {/* ── Brand & links ────────────────────────────────────────────── */}
      <Card className="order-3 gap-6 p-6 sm:p-8 lg:order-2">
        <SectionHeader
          icon={PaletteDuotoneIcon}
          title={t("brandTitle")}
          description={t.rich("brandDescription", {
            link: (chunks) => (
              <Link
                href="/dashboard/career-page"
                className="inline-flex items-center gap-0.5 font-medium text-pine underline-offset-2 hover:underline"
              >
                {chunks}
                <ArrowUpRightIcon className="size-3.5" />
              </Link>
            ),
          })}
        />

        <form action={brandingAction} className="space-y-6">
          <input type="hidden" name="heroImageUrl" value={heroImageUrl} />
          <input
            type="hidden"
            name="description"
            value={workspace.description ?? ""}
          />
          <input type="hidden" name="boardStyle" value={workspace.boardStyle} />
          <input type="hidden" name="logoStyle" value={workspace.logoStyle} />
          <input
            type="hidden"
            name="hideHarlyBranding"
            value={hideHarlyBranding ? "true" : "false"}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ws-website">{t("website")}</Label>
              <Input
                id="ws-website"
                name="websiteUrl"
                type="url"
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
                placeholder="https://acme.com"
                disabled={!canEdit || savingBranding}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-color">{t("primaryColor")}</Label>
              <div className="flex items-center gap-2 rounded-lg border bg-card p-1 pr-3">
                <label
                  className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-border"
                  style={{ backgroundColor: previewColor }}
                  aria-label={t("pickPrimaryColor")}
                >
                  <input
                    type="color"
                    value={previewColor}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    disabled={!canEdit || savingBranding}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
                <Input
                  id="ws-color"
                  name="primaryColor"
                  value={primaryColor}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                  className="h-8 border-0 bg-transparent px-0 font-mono uppercase shadow-none focus-visible:ring-0"
                  disabled={!canEdit || savingBranding}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ws-tagline">{t("tagline")}</Label>
            <Input
              id="ws-tagline"
              name="tagline"
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
              placeholder={t("taglinePlaceholder")}
              maxLength={120}
              disabled={!canEdit || savingBranding}
            />
            <p className="text-xs text-muted-foreground">
              {t("taglineHelp")}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t("defaultBanner")}</Label>
            <FileDropzone
              value={heroImageUrl || null}
              onChange={(url) => setHeroImageUrl(url ?? "")}
              aspect="banner"
              disabled={!canEdit}
              hint={t("defaultBannerHint")}
            />
          </div>

          <SettingRow
            htmlFor="branding-hide-harly"
            descriptionId="branding-hide-harly-desc"
            className="rounded-[var(--radius-inner)] border border-hairline px-4 py-3"
            title={t("hideHarlyTitle")}
            description={t("hideHarlyDescription")}
            control={
              <Switch
                id="branding-hide-harly"
                aria-describedby="branding-hide-harly-desc"
                checked={hideHarlyBranding}
                onCheckedChange={setHideHarlyBranding}
                disabled={!canEdit || savingBranding}
              />
            }
          />

          <div className="flex justify-end border-t pt-6">
            <Button type="submit" disabled={!canEdit || savingBranding}>
              {savingBranding ? t("saving") : t("saveBrand")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
