"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import { saveOfferSignatureChannelAction } from "@/features/workspaces/esign-settings-actions";
import type { WorkspaceEsignStatus } from "@/lib/esign/config";
import { IntegrationHeader } from "@/features/workspaces/IntegrationDetailShell";
import { PencilIcon, GearSixIcon } from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Harly's built-in native signing — no connection to make, so this panel is
 * purely offer-channel configuration + a link to the deeper native-sign
 * settings (OTP, remote links, evidence) at /settings/signature.
 */
export function HarlySignConnectPanel({
  status,
  canEdit,
  tileClassName,
  description,
  docusealConnected,
}: {
  status: WorkspaceEsignStatus;
  canEdit: boolean;
  tileClassName: string;
  description: string;
  docusealConnected: boolean;
}) {
  const router = useRouter();
  const [savingChannel, startSaveChannel] = useTransition();

  function setChannel(channel: "email" | "esign" | "native") {
    startSaveChannel(async () => {
      const result = await saveOfferSignatureChannelAction(channel);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update offer signature settings.");
        return;
      }
      toast.success(
        channel === "esign"
          ? "DocuSeal enabled for offers"
          : channel === "native"
            ? "Native signing enabled for offers"
            : "Email enabled for offers",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader
      logo={PencilIcon}
        tileClassName={tileClassName}
        name="Harly Sign"
        description={description}
        statusLabel="Connected"
        statusTone="on"
        action={
          <Button variant="outline" asChild>
            <Link href="/settings/signature">
              <GearSixIcon className="size-4" />
              Signature settings
            </Link>
          </Button>
        }
      />

      {canEdit ? (
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">Offer signature delivery</h2>
            <p className="text-sm text-muted-foreground">Choose how candidates receive offers by default.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={status.offerSignatureChannel === "email" ? "default" : "outline"} disabled={savingChannel} onClick={() => setChannel("email")}>Email</Button>
            <Button variant={status.offerSignatureChannel === "native" ? "default" : "outline"} disabled={savingChannel} onClick={() => setChannel("native")}>Native (built-in)</Button>
            <Button
              variant={status.offerSignatureChannel === "esign" ? "default" : "outline"}
              disabled={savingChannel || !docusealConnected}
              title={docusealConnected ? undefined : "Connect DocuSeal first"}
              onClick={() => setChannel("esign")}
            >
              DocuSeal{docusealConnected ? "" : " (not connected)"}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
