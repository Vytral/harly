import Link from "next/link";

import { ForgotPasswordForm } from "./_components/forgot-password-form";

export default function ForgotPasswordPage() {
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
            Forgot password
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a link to reset it.
          </p>

          <div className="mt-10">
            <ForgotPasswordForm />
          </div>
        </div>
      </main>
    </div>
  );
}
