import Link from "next/link";

import { ResetPasswordForm } from "./_components/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        <Link href="/" className="font-display text-lg tracking-tight text-pine">
          Harly
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          Back to sign in
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl tracking-tight text-foreground">
            Reset password
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a new password for your account.
          </p>

          <div className="mt-10">
            <ResetPasswordForm token={token ?? null} tokenError={error ?? null} />
          </div>
        </div>
      </main>
    </div>
  );
}
