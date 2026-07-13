"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import { authClient } from "@harly/auth/client";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import {
  DeviceMobileDuotoneIcon,
  CheckIcon,
  SpinnerIcon,
  CopyIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "idle" | "password" | "configure" | "done" | "disable";

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setStep("idle");
    setTotpUri("");
    setBackupCodes([]);
    setOtp("");
    setPassword("");
  }

  // Step 1: call enable({password}) → get URI + backup codes
  function handleEnable() {
    startTransition(async () => {
      const res = await authClient.twoFactor.enable({ password });
      if (res.error) {
        toast.error(res.error.message ?? "Invalid password");
        return;
      }
      const data = res.data as { totpURI?: string; backupCodes?: string[] } | null;
      setTotpUri(data?.totpURI ?? "");
      setBackupCodes(data?.backupCodes ?? []);
      setPassword("");
      setStep("configure");
    });
  }

  // Step 2: call verifyTotp({code}) → twoFactorEnabled = true
  function handleVerify() {
    startTransition(async () => {
      const res = await authClient.twoFactor.verifyTotp({ code: otp });
      if (res.error) {
        toast.error(res.error.message ?? "Invalid code — try again");
        return;
      }
      setOtp("");
      setStep("done");
      router.refresh();
    });
  }

  function handleDisable() {
    startTransition(async () => {
      const res = await authClient.twoFactor.disable({ password });
      if (res.error) {
        toast.error(res.error.message ?? "Invalid password");
        return;
      }
      toast.success("Two-factor authentication disabled");
      reset();
      router.refresh();
    });
  }

  function copyBackupCodes() {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    toast.success("Backup codes copied");
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={DeviceMobileDuotoneIcon}
        title="Two-Factor Authentication"
        description="Protect your account with a one-time code from your authenticator app or email."
        badge={
          <StatusPill tone={enabled ? "on" : "off"}>
            {enabled ? "Enabled" : "Disabled"}
          </StatusPill>
        }
        action={
          step === "idle" ? (
            enabled ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("disable")}
              >
                Disable 2FA
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep("password")}>
                Enable 2FA
              </Button>
            )
          ) : null
        }
      />

      {/* Enter password to start setup */}
      {step === "password" && (
        <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            Confirm your password to generate an authenticator QR code.
          </p>
          <div className="space-y-2">
            <Label htmlFor="2fa-pw">Password</Label>
            <Input
              id="2fa-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && password && handleEnable()}
              autoComplete="current-password"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleEnable}
              disabled={!password || isPending}
            >
              {isPending && <SpinnerIcon className="mr-1.5 size-3.5" />}
              Continue
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* QR code + backup codes + OTP verify */}
      {step === "configure" && totpUri && (
        <div className="space-y-5 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            Scan this QR code with your authenticator app (Authy, Google
            Authenticator, 1Password…), then enter the 6-digit code to
            confirm setup.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* QR code */}
            <div className="flex justify-center sm:justify-start">
              <div className="rounded-xl border bg-white p-3 shadow-sm">
                <QRCodeSVG value={totpUri} size={168} />
              </div>
            </div>

            {/* Backup codes */}
            <div className="flex-1 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Backup codes
              </p>
              <div className="grid grid-cols-2 gap-1 rounded-lg border bg-card p-2.5 font-mono text-xs">
                {backupCodes.map((c) => (
                  <span key={c} className="select-all text-foreground/80">
                    {c}
                  </span>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={copyBackupCodes}
              >
                <CopyIcon className="mr-1 size-3" />
                Copy backup codes
              </Button>
            </div>
          </div>

          {/* OTP input */}
          <div className="space-y-2">
            <Label htmlFor="2fa-code">Enter code from app</Label>
            <div className="flex gap-2">
              <Input
                id="2fa-code"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                onKeyDown={(e) =>
                  e.key === "Enter" && otp.length === 6 && handleVerify()
                }
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                className="w-36 font-mono tracking-widest"
                autoComplete="one-time-code"
              />
              <Button
                size="sm"
                onClick={handleVerify}
                disabled={otp.length !== 6 || isPending}
              >
                {isPending && <SpinnerIcon className="mr-1.5 size-3.5" />}
                Verify & Enable
              </Button>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={reset}>
            Cancel
          </Button>
        </div>
      )}

      {/* Success state */}
      {step === "done" && (
        <div className="flex items-start gap-3 rounded-xl border border-pine/20 bg-sage/10 p-4">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-pine/15">
            <CheckIcon className="size-3 text-pine" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium">2FA is now active</p>
            <p className="text-sm text-muted-foreground">
              Store your backup codes in a safe place — each works once if
              you lose access to your authenticator.
            </p>
          </div>
        </div>
      )}

      {/* Disable 2FA */}
      {step === "disable" && (
        <div className="space-y-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm text-muted-foreground">
            Enter your password to disable two-factor authentication.
          </p>
          <div className="space-y-2">
            <Label htmlFor="disable-pw">Password</Label>
            <Input
              id="disable-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && password && handleDisable()}
              autoComplete="current-password"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisable}
              disabled={!password || isPending}
            >
              {isPending && <SpinnerIcon className="mr-1.5 size-3.5" />}
              Disable 2FA
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
