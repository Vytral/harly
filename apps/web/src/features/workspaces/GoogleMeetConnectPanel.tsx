"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

import {
  disconnectGCalAction,
  testGCalConnectionAction,
} from "@/features/workspaces/gcal-settings-actions";
import type { WorkspaceGCalStatus } from "@/lib/gcal/config";
import {
  IntegrationHeader,
  InlineReveal,
} from "@/features/workspaces/IntegrationDetailShell";
import { StatCell } from "@/features/workspaces/settings-ui";
import { GoogleMeetLogo, GoogleCalendarLogo } from "@/components/ui/icons/brands";
import {
  ArrowUpRightIcon,
  GearSixIcon,
  SealCheckDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Google Meet shares the Google Calendar OAuth connection (same token, same
 * DB row, same callback). This panel surfaces Meet's identity and reuses the
 * GCal actions: connecting flips both cards, disconnecting clears both.
 * Calendar selection lives on the Google Calendar card.
 */
export function GoogleMeetConnectPanel({
  status,
  canEdit,
  workspaceId,
  tileClassName,
  description,
}: {
  status: WorkspaceGCalStatus;
  canEdit: boolean;
  workspaceId: string;
  tileClassName: string;
  description: string;
}) {
  const router = useRouter();
  const isConnected = status.hasRefreshToken;
  const [open, setOpen] = useState(isConnected);
  const [disconnecting, startDisconnect] = useTransition();
  const [testing, startTest] = useTransition();

  const statusTone = isConnected ? (status.enabled ? "on" : "off") : "neutral";
  const statusLabel = isConnected
    ? status.enabled
      ? "Connected"
      : "Disabled"
    : "Not connected";

  const installUrl = `/api/integrations/google/install?ws=${workspaceId}`;

  function disconnect() {
    startDisconnect(async () => {
      const result = await disconnectGCalAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not disconnect.");
        return;
      }
      toast.success("Google Meet disconnected");
      router.refresh();
    });
  }

  function testConnection() {
    startTest(async () => {
      const result = await testGCalConnectionAction();
      if (result.ok) {
        toast.success("Connection is working!");
      } else {
        toast.error(result.error ?? "Connection test failed.");
        // The server clears a revoked token on invalid_grant; refresh so the
        // panel immediately exposes the reconnect action.
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
        logo={GoogleMeetLogo}
        tileClassName={tileClassName}
        name="Google Meet"
        description={description}
        statusLabel={statusLabel}
        statusTone={statusTone}
        action={
          canEdit ? (
            isConnected ? (
              <Button
                variant="outline"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                <GearSixIcon className="size-4" />
                {open ? "Hide settings" : "Manage"}
              </Button>
            ) : status.hasCredentials ? (
              <Button asChild>
                <a href={installUrl}>
                  <GoogleCalendarLogo className="size-4" />
                  Connect Google
                </a>
              </Button>
            ) : (
              <Button disabled>
                <GoogleCalendarLogo className="size-4" />
                Credentials not set
              </Button>
            )
          ) : null
        }
      />

      {!status.hasCredentials && !isConnected ? (
        <div className="flex items-start gap-2 rounded-xl border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Set <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code> and{" "}
            <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code> on
            the server to enable Google Meet.
          </p>
        </div>
      ) : null}

      {isConnected ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatCell label="Account">
              <GoogleCalendarLogo className="size-4" />
              {status.accountEmail ?? "Not connected"}
            </StatCell>
            <StatCell label="Meet">
              {status.enabled ? (
                <>
                  <SealCheckDuotoneIcon className="size-3.5 text-pine" />
                  Ready
                </>
              ) : (
                "Not enabled"
              )}
            </StatCell>
            <StatCell label="Status">
              <button
                type="button"
                onClick={testConnection}
                disabled={testing}
                className="flex items-center gap-1.5 text-sm font-medium text-pine hover:underline disabled:opacity-50"
              >
                {testing ? (
                  <SpinnerIcon className="size-3.5" />
                ) : (
                  <SealCheckDuotoneIcon className="size-3.5" />
                )}
                {testing ? "Testing…" : "Test connection"}
              </button>
            </StatCell>
          </div>
        </Card>
      ) : null}

      {isConnected && canEdit ? (
        <InlineReveal open={open}>
          <Card className="p-6">
            <div className="mb-5 space-y-0.5">
              <h2 className="font-display text-base font-semibold tracking-tight">
                Google Meet
              </h2>
              <p className="text-sm text-muted-foreground">
                Meet creates a video link for every video interview scheduled
                through Google Calendar. Calendar selection lives on the Google
                Calendar card.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={disconnect}
                disabled={disconnecting}
              >
                {disconnecting ? <SpinnerIcon className="size-3.5" /> : null}
                Disconnect
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/settings/integrations/google-calendar">
                  Manage calendar
                  <ArrowUpRightIcon className="size-3.5" />
                </Link>
              </Button>
            </div>
          </Card>
        </InlineReveal>
      ) : null}
    </div>
  );
}
