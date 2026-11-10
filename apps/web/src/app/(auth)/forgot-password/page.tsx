import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getAuthBranding } from "@/features/auth/branding.server";
import { isStaffEmailDeliveryConfigured } from "@/features/auth/login-methods.server";
import { AuthShell, AuthCard } from "../_components/auth-shell";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const [branding, emailConfigured, t] = await Promise.all([
    getAuthBranding(),
    isStaffEmailDeliveryConfigured(),
    getTranslations("forgotPassword"),
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
        subtitle={
          emailConfigured
            ? t("subtitle")
            : t("unavailable")
        }
        footer={
          t.rich("remembered", {
            link: (chunks) => (
              <Link href="/login" className="font-semibold text-foreground hover:underline">
                {chunks}
              </Link>
            ),
          })
        }
      >
        {emailConfigured ? (
          <ForgotPasswordForm />
        ) : (
          <p role="status" className="text-sm leading-6 text-muted-foreground">
            {t("noEmail")}
          </p>
        )}
      </AuthCard>
    </AuthShell>
  );
}
