"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  disableInviteLinkAction,
  enableInviteLinkAction,
  rotateInviteLinkAction,
} from "@/features/workspaces/actions";
import type {
  AssignableRole,
  InviteLinkState,
} from "@/features/workspaces/InviteTeammatesSheet";
import { CheckIcon, CopyIcon } from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

/** Share-link icon (streamline:share-link via better-icons). */
function ShareLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 14 14"
      className={className ?? "size-4"}
      aria-hidden="true"
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.75 9.25a2.25 2.25 0 1 0 0-4.5a2.25 2.25 0 0 0 0 4.5m8.5 4.25a2.25 2.25 0 1 0 0-4.5a2.25 2.25 0 0 0 0 4.5m0-8.5a2.25 2.25 0 1 0 0-4.5a2.25 2.25 0 0 0 0 4.5M4.76 6l4.48-2.25M4.76 8l4.48 2.25"
      />
    </svg>
  );
}

/**
 * Invite-link control rendered as an icon button beside "Invite". Opens a
 * popover to toggle, copy, and rotate the workspace's shareable join link.
 */
export function InviteLinkButton({
  inviteLink,
  assignableRoles,
}: {
  inviteLink: InviteLinkState;
  assignableRoles: AssignableRole[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState(inviteLink.role);

  const url =
    inviteLink.token && typeof window !== "undefined"
      ? `${window.location.origin}/join/${inviteLink.token}`
      : null;

  function enable() {
    start(async () => {
      const fd = new FormData();
      fd.set("role", role);
      const result = await enableInviteLinkAction({ success: false }, fd);
      if (result.success) {
        toast.success("Invite link enabled");
        router.refresh();
      } else {
        toast.error(result.error ?? "Unable to enable link.");
      }
    });
  }

  function disable() {
    start(async () => {
      const result = await disableInviteLinkAction();
      if (result.success) {
        toast.success("Invite link disabled");
        router.refresh();
      } else {
        toast.error(result.error ?? "Unable to disable link.");
      }
    });
  }

  function rotate() {
    start(async () => {
      const result = await rotateInviteLinkAction();
      if (result.success) {
        toast.success("New link generated — old one disabled");
        router.refresh();
      } else {
        toast.error(result.error ?? "Unable to rotate link.");
      }
    });
  }

  function copy() {
    if (!url) return;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Invite link"
          title="Invite link"
          className={inviteLink.enabled ? "text-pine" : "text-muted-foreground"}
        >
          <ShareLinkIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Invite link</p>
            <p className="text-xs text-muted-foreground">
              Share one link instead of emailing each person.
            </p>
          </div>
          <Switch
            checked={inviteLink.enabled}
            disabled={pending}
            onCheckedChange={(checked) => (checked ? enable() : disable())}
          />
        </div>

        {inviteLink.enabled && url ? (
          <>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={url}
                className="flex-1 bg-muted/30 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={copy}
                aria-label="Copy link"
              >
                {copied ? (
                  <CheckIcon className="size-4 text-pine" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Joins as{" "}
                <span className="font-medium capitalize text-foreground">
                  {inviteLink.role.replace("_", " ")}
                </span>
                .
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={rotate}
                disabled={pending}
                className="shrink-0 text-xs text-muted-foreground"
              >
                Rotate
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Role new joiners get
            </Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Enable the toggle above to generate the link.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
