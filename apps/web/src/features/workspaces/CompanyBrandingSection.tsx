"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  updateWorkspaceBoardBrandingAction,
  updateWorkspaceProfileAction,
} from "@/features/workspaces/actions";
import {
  DEFAULT_BOARD_PRIMARY_COLOR,
  type BoardStyle,
  type LogoStyle,
} from "@/features/workspaces/board";
import type { WorkspaceBranding } from "@/features/workspaces/data";
import type { WorkspaceRole } from "@/features/workspaces/roles";
import { BoardPreview } from "@/features/workspaces/BoardPreview";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
            value === option.value
              ? "bg-card text-foreground shadow-sm"
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
  useActionToast(brandingState, "Careers page saved.");

  const [name, setName] = useState(workspace.name);
  const [logoUrl, setLogoUrl] = useState(workspace.logoUrl ?? "");
  const [tagline, setTagline] = useState(workspace.tagline ?? "");
  const [description, setDescription] = useState(workspace.description ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(workspace.websiteUrl ?? "");
  const [heroImageUrl, setHeroImageUrl] = useState(workspace.heroImageUrl ?? "");
  const [primaryColor, setPrimaryColor] = useState(
    workspace.primaryColor ?? DEFAULT_BOARD_PRIMARY_COLOR,
  );
  const [boardStyle, setBoardStyle] = useState<BoardStyle>(workspace.boardStyle);
  const [logoStyle, setLogoStyle] = useState<LogoStyle>(workspace.logoStyle);

  const previewColor = /^#[0-9a-fA-F]{6}$/.test(primaryColor)
    ? primaryColor
    : DEFAULT_BOARD_PRIMARY_COLOR;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        {/* Identity */}
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>
              Logo and name shown across Harly and your careers page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={profileAction}
              className="flex flex-col gap-5 sm:flex-row sm:items-start"
            >
              <input type="hidden" name="logoUrl" value={logoUrl} />
              <div className="space-y-2">
                <Label>Logo</Label>
                <FileDropzone
                  value={logoUrl || null}
                  onChange={(url) => setLogoUrl(url ?? "")}
                  aspect="square"
                  disabled={!canEdit}
                  hint="Square · PNG or SVG"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="ws-name">Company name</Label>
                <Input
                  id="ws-name"
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!canEdit || savingProfile}
                />
                <div className="pt-1">
                  <Button type="submit" disabled={!canEdit || savingProfile}>
                    {savingProfile ? "Saving…" : "Save identity"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Public careers page */}
        <Card>
          <CardHeader>
            <CardTitle>Public careers page</CardTitle>
            <CardDescription>
              Banner, copy, color, and style candidates see at your board.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={brandingAction} className="space-y-5">
              <input type="hidden" name="boardStyle" value={boardStyle} />
              <input type="hidden" name="logoStyle" value={logoStyle} />
              <input type="hidden" name="heroImageUrl" value={heroImageUrl} />

              <div className="space-y-2">
                <Label>Banner</Label>
                <FileDropzone
                  value={heroImageUrl || null}
                  onChange={(url) => setHeroImageUrl(url ?? "")}
                  aspect="banner"
                  disabled={!canEdit}
                  hint="Wide image · 1500×500 recommended"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ws-tagline">Tagline</Label>
                <Input
                  id="ws-tagline"
                  name="tagline"
                  value={tagline}
                  onChange={(event) => setTagline(event.target.value)}
                  maxLength={280}
                  placeholder="One line under your company name."
                  disabled={!canEdit || savingBranding}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ws-description">Description</Label>
                <Textarea
                  id="ws-description"
                  name="description"
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={1000}
                  placeholder="A short paragraph about your company."
                  disabled={!canEdit || savingBranding}
                />
                <p className="text-right text-xs text-muted-foreground">
                  {description.length}/1000
                </p>
              </div>

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
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={previewColor}
                      onChange={(event) => setPrimaryColor(event.target.value)}
                      disabled={!canEdit || savingBranding}
                      className="size-9 shrink-0 cursor-pointer rounded-md border bg-card p-1"
                      aria-label="Primary color picker"
                    />
                    <Input
                      id="ws-color"
                      name="primaryColor"
                      value={primaryColor}
                      onChange={(event) => setPrimaryColor(event.target.value)}
                      className="font-mono"
                      disabled={!canEdit || savingBranding}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Board style</Label>
                  <div>
                    <Segmented
                      options={[
                        { value: "hero", label: "Hero" },
                        { value: "minimal", label: "Minimal" },
                      ]}
                      value={boardStyle}
                      onChange={setBoardStyle}
                      disabled={!canEdit || savingBranding}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Logo style</Label>
                  <div>
                    <Segmented
                      options={[
                        { value: "bordered", label: "Bordered" },
                        { value: "full", label: "Full" },
                      ]}
                      value={logoStyle}
                      onChange={setLogoStyle}
                      disabled={!canEdit || savingBranding}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={!canEdit || savingBranding}>
                  {savingBranding ? "Saving…" : "Save careers page"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Live preview */}
      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Live preview
        </p>
        <BoardPreview
          name={name}
          slug={workspace.slug}
          logoUrl={logoUrl || null}
          tagline={tagline || null}
          heroImageUrl={heroImageUrl || null}
          primaryColor={previewColor}
          boardStyle={boardStyle}
          logoStyle={logoStyle}
        />
      </div>
    </div>
  );
}
