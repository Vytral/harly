"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

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
    <div className="inline-flex rounded-xl border bg-muted/50 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            value === option.value
              ? "bg-card text-foreground shadow-sm ring-1 ring-border"
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
}: {
  workspace: WorkspaceBranding;
  currentRole: WorkspaceRole;
}) {
  const canEdit = currentRole === "owner" || currentRole === "admin";

  const [profileState, profileAction, savingProfile] = useActionState(
    updateWorkspaceProfileAction,
    initialActionState,
  );
  const [brandingState, brandingAction, savingBranding] = useActionState(
    updateWorkspaceBoardBrandingAction,
    initialActionState,
  );
  useActionToast(profileState, "Identity saved.");
  useActionToast(brandingState, "Brand settings saved.");

  const [name, setName] = useState(workspace.name);
  const [logoUrl, setLogoUrl] = useState(workspace.logoUrl ?? "");
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

  const previewColor = /^#[0-9a-fA-F]{6}$/.test(primaryColor)
    ? primaryColor
    : DEFAULT_BOARD_PRIMARY_COLOR;

  return (
    <div className="max-w-3xl space-y-6">
      {/* ── Identity ─────────────────────────────────────────────────── */}
      <Card className="gap-6 p-6 sm:p-8">
        <SectionHeader
          icon={BuildingsIcon}
          title="Identity"
          description="Logo and name shown across Harly and your careers page."
        />

        <form action={profileAction} className="space-y-6">
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
              onChange={(url) => setLogoUrl(url ?? "")}
              variant="avatar"
              disabled={!canEdit}
              hint="Square · PNG or SVG"
            />
            <div className="flex-1 space-y-2">
              <Label htmlFor="ws-name">Company name</Label>
              <Input
                id="ws-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canEdit || savingProfile}
              />
              <p className="text-xs text-muted-foreground">
                Square logo, used as the app icon and avatar.
              </p>
            </div>
          </div>

          {/* Sidebar logo */}
          <div className="space-y-3 border-t pt-6">
            <div className="space-y-1">
              <Label>Sidebar logo</Label>
              <p className="text-xs text-muted-foreground">
                Replace the workspace name with a wide wordmark logo in the
                dashboard sidebar.
              </p>
            </div>
            <Segmented
              options={[
                { value: "bordered", label: "Icon + name" },
                { value: "full", label: "Full logo" },
              ]}
              value={sidebarLogoStyle}
              onChange={setSidebarLogoStyle}
              disabled={!canEdit || savingProfile}
            />

            {sidebarLogoStyle === "full" ? (
              <div className="grid gap-4 pt-1 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Light mode
                  </Label>
                  <FileDropzone
                    value={sidebarLogoUrl || null}
                    onChange={(url) => setSidebarLogoUrl(url ?? "")}
                    aspect="banner"
                    disabled={!canEdit}
                    hint="Wide logo · transparent PNG/SVG"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Dark mode
                  </Label>
                  <div className="rounded-2xl bg-zinc-950 p-2">
                    <FileDropzone
                      value={sidebarLogoDarkUrl || null}
                      onChange={(url) => setSidebarLogoDarkUrl(url ?? "")}
                      aspect="banner"
                      disabled={!canEdit}
                      hint="Optional · falls back to light"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex justify-end border-t pt-6">
            <Button type="submit" disabled={!canEdit || savingProfile}>
              {savingProfile ? "Saving…" : "Save identity"}
            </Button>
          </div>
        </form>
      </Card>

      {/* ── Brand & links ────────────────────────────────────────────── */}
      <Card className="gap-6 p-6 sm:p-8">
        <SectionHeader
          icon={PaletteDuotoneIcon}
          title="Brand & links"
          description={
            <>
              Color, website and fallback banner used across your careers pages,
              application emails and job posts.{" "}
              <Link
                href="/dashboard/career-page"
                className="inline-flex items-center gap-0.5 font-medium text-pine underline-offset-2 hover:underline"
              >
                Customize your careers page
                <ArrowUpRightIcon className="size-3.5" />
              </Link>
            </>
          }
        />

        <form action={brandingAction} className="space-y-6">
          <input type="hidden" name="heroImageUrl" value={heroImageUrl} />
          <input type="hidden" name="tagline" value={workspace.tagline ?? ""} />
          <input
            type="hidden"
            name="description"
            value={workspace.description ?? ""}
          />
          <input type="hidden" name="boardStyle" value={workspace.boardStyle} />
          <input type="hidden" name="logoStyle" value={workspace.logoStyle} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ws-website">Website</Label>
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
              <Label htmlFor="ws-color">Primary color</Label>
              <div className="flex items-center gap-2 rounded-lg border bg-card p-1 pr-3">
                <label
                  className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-border"
                  style={{ backgroundColor: previewColor }}
                  aria-label="Pick primary color"
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
            <Label>Default banner</Label>
            <FileDropzone
              value={heroImageUrl || null}
              onChange={(url) => setHeroImageUrl(url ?? "")}
              aspect="banner"
              disabled={!canEdit}
              hint="Fallback banner for your careers page · 1500×500"
            />
          </div>

          <div className="flex justify-end border-t pt-6">
            <Button type="submit" disabled={!canEdit || savingBranding}>
              {savingBranding ? "Saving…" : "Save brand"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
