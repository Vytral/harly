"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Unplug, Loader2, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

import type { ZoomConfig } from "@/lib/zoom/config";
import { uninstallZoom } from "./zoom-settings-actions";
import { ZoomLogo } from "@/components/ui/icons/brands";

function StatusBadge({ state }: { state: ZoomConfig["installationState"] }) {
  if (state === "installed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3" />
        Installed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      Not Installed
    </span>
  );
}

export function ZoomSettingsCard({ config }: { config: ZoomConfig }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/integrations/zoom/install`, {
        method: "GET",
      });

      if (response.redirected) {
        window.location.href = response.url;
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to start Zoom OAuth");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error("Zoom connection failed", { description: message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const result = await uninstallZoom();
      if (result.success) {
        toast.success("Zoom disconnected");
        router.refresh();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error("Failed to disconnect Zoom", { description: message });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10">
            <ZoomLogo className="size-5" />
          </div>
          <div>
            <CardTitle className="text-base">Zoom</CardTitle>
            <CardDescription className="mt-1">
              Create and manage Zoom meetings for video interviews
            </CardDescription>
          </div>
        </div>
        <StatusBadge state={config.installationState} />
      </CardHeader>
      <CardContent>
        {config.installationState === "installed" ? (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/50 px-4 py-3 text-sm">
              <div className="font-medium">{config.accountEmail ?? "Zoom Account"}</div>
              <div className="mt-1 text-muted-foreground">
                Connected to Zoom. Video interviews will automatically create Zoom meetings.
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <a href="https://zoom.us/profile" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Zoom Dashboard
                </a>
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={isDisconnecting}>
                {isDisconnecting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Unplug className="size-4" />
                )}
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Connect Zoom to automatically create and manage video meetings for scheduled interviews.
            </p>
            <Button onClick={handleConnect} disabled={isLoading || !config.configured} size="sm" className="w-fit">
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ZoomLogo className="size-4" />
              )}
              Connect Zoom
            </Button>
            {!config.configured && (
              <p className="text-xs text-muted-foreground">
                Zoom OAuth is not configured. Set ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET in your environment.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
