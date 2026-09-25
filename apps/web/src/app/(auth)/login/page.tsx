import { getAvailableLoginMethods } from "@/features/auth/login-methods.server";
import { getAuthBranding } from "@/features/auth/branding.server";
import { AuthShell, AuthCard } from "../_components/auth-shell";
import { LoginForm } from "./_components/login-form";

type LoginPageProps = {
  searchParams: Promise<{ redirect?: string }>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ redirect }, methods, branding] = await Promise.all([
    searchParams,
    getAvailableLoginMethods(),
    getAuthBranding(),
  ]);

  return (
    <AuthShell branding={branding}>
      <AuthCard
        title="Sign in"
        subtitle="Welcome back. Enter your credentials to continue."
      >
        <LoginForm redirect={redirect} methods={methods} />
      </AuthCard>
    </AuthShell>
  );
}
