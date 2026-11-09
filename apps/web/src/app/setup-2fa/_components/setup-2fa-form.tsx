"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { authErrorKey } from "@/features/auth/i18n/error-keys";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "@/lib/notification-island/toast";
import { copyText } from "@/lib/utils";

import { authClient } from "@harly/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SpinnerIcon,
  CopyIcon,
  CheckIcon,
  DownloadDuotoneIcon,
} from "@/components/ui/icons/phosphor";

type Step = "password" | "configure" | "done";

/** Single-tenant deployments serve the app from the workspace's own domain, so
 *  the browser hostname doubles as a stable authenticator issuer label. */
function currentIssuer(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.hostname || undefined;
}

export function Setup2FAForm() {
  const errorText = useTranslations("accessAuthErrors");
  const t = useTranslations("accessTwoFactor");
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Step 1: call enable({password}) → get URI + backup codes
  function handleEnable() {
    startTransition(async () => {
      const res = await authClient.twoFactor.enable({
        password,
        issuer: currentIssuer(),
      });
      if (res.error) {
        toast.error(errorText(authErrorKey(res.error.code, "enableFailed")));
        return;
      }
      const data = res.data as {
        totpURI?: string;
        backupCodes?: string[];
      } | null;
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
        toast.error(errorText(authErrorKey(res.error.code, "verificationFailed")));
        return;
      }
      setOtp("");
      setStep("done");
    });
  }

  function copyBackupCodes() {
    copyText(backupCodes.join("\n"));
    toast.success(t("copied"));
  }

  function downloadBackupCodes() {
    const blob = new Blob(
      [
        `${t("fileHeading")}\n${t("fileHelp")}\n\n${backupCodes.join("\n")}\n`,
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "harly-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Done: show success + continue button ──────────────────────────────────
  if (step === "done") {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-3 rounded-xl border border-pine/20 bg-sage/10 p-4">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-pine/15">
            <CheckIcon className="size-3 text-pine" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("active")}</p>
            <p className="text-sm text-muted-foreground">
              {t("backupHelp")}
            </p>
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={() => {
            router.replace("/dashboard");
            router.refresh();
          }}
        >
          {t("dashboard")}
        </Button>
      </div>
    );
  }

  // ── Password step ─────────────────────────────────────────────────────────
  if (step === "password") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="2fa-pw">{t("password")}</Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-muted-foreground transition hover:text-pine"
            >
              {t("forgotPassword")}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="2fa-pw"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && password && handleEnable()
              }
              autoComplete="current-password"
              placeholder={t("passwordPlaceholder")}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("confirmHelp")}
          </p>
        </div>
        <Button
          className="w-full"
          size="lg"
          onClick={handleEnable}
          disabled={!password || isPending}
        >
          {isPending && <SpinnerIcon className="mr-1.5 size-4" />}
          {t("continue")}
        </Button>
      </div>
    );
  }

  // ── Configure step: QR + backup codes + OTP ───────────────────────────────
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {t("scanHelp")}
      </p>

      {/* QR code */}
      {totpUri && (
        <div className="flex justify-center">
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <QRCodeSVG value={totpUri} size={180} />
          </div>
        </div>
      )}

      {/* Backup codes */}
      {backupCodes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("backupCodes")}
          </p>
          <div className="grid grid-cols-2 gap-1 rounded-lg border bg-card p-2.5 font-mono text-xs">
            {backupCodes.map((c) => (
              <span key={c} className="select-all text-foreground/80">
                {c}
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={copyBackupCodes}
            >
              <CopyIcon className="mr-1 size-3" />
              {t("copy")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={downloadBackupCodes}
            >
              <DownloadDuotoneIcon className="mr-1 size-3" />
              {t("download")}
            </Button>
          </div>
        </div>
      )}

      {/* OTP input */}
      <div className="space-y-2">
        <Label htmlFor="2fa-code">{t("enterCode")}</Label>
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
            {t("verify")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M1 9s3-5.5 8-5.5S17 9 17 9s-3 5.5-8 5.5S1 9 1 9Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M2 2l14 14M7.5 7.6A2 2 0 0 0 10.4 10.5M5 4.9C2.8 6.3 1 9 1 9s3 5.5 8 5.5c1.6 0 3-.5 4.2-1.2M9 3.5c4.5.2 7 5.5 7 5.5s-.7 1.4-2 2.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
