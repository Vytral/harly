import Link from "next/link";

import { SignupForm } from "./_components/signup-form";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        <Link href="/" className="font-display text-lg tracking-tight text-pine">
          OpenHire
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          Sign in
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl tracking-tight text-foreground">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set up your ATS in minutes. No credit card required.
          </p>

          <div className="mt-10">
            <SignupForm />
          </div>
        </div>
      </main>
    </div>
  );
}
