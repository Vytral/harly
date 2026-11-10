import { getTranslations } from "next-intl/server";
import { getAvailableLoginMethods } from "@/features/auth/login-methods.server";
import { getAuthBranding } from "@/features/auth/branding.server";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { AuthShell, AuthCard } from "../_components/auth-shell";
import { LoginForm } from "./_components/login-form";

type LoginPageProps = {
  searchParams: Promise<{ redirect?: string }>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ redirect }, methods, branding, t] = await Promise.all([
    searchParams,
    getAvailableLoginMethods(),
    getAuthBranding(),
    getTranslations("accessLogin"),
  ]);

  return (
    <AuthShell branding={branding}>
      <AuthCard
        title={t("title")}
        subtitle={t("subtitle")}
      >
        <LoginForm redirect={safeRedirectPath(redirect)} methods={methods} />
      </AuthCard>
    </AuthShell>
  );
}
