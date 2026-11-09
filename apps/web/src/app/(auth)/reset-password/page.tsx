import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getAuthBranding } from "@/features/auth/branding.server";
import { AuthShell, AuthCard } from "../_components/auth-shell";
import { ResetPasswordForm } from "./_components/reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const [{ token, error }, branding, t] = await Promise.all([
    searchParams,
    getAuthBranding(),
    getTranslations("accessReset"),
  ]);

  return (
    <AuthShell
      branding={branding}
      rightSlot={
        <Link
          href="/login"
          className="font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("back")}
        </Link>
      }
    >
      <AuthCard
        title={t("title")}
        subtitle={t("subtitle")}
      >
        <ResetPasswordForm token={token ?? null} tokenError={error ?? null} />
      </AuthCard>
    </AuthShell>
  );
}
