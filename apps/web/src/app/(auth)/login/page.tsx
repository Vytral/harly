import Link from "next/link";

import { LoginForm } from "./_components/login-form";

type LoginPageProps = {
  searchParams: Promise<{ redirect?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirect } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        <Link href="/" className="font-display text-lg tracking-tight text-pine">
          Harly
        </Link>
        <Link
          href="/signup"
          className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          Create account
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl tracking-tight text-foreground">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Welcome back. Enter your credentials to continue.
          </p>

          <div className="mt-10">
            <LoginForm redirect={redirect} />
          </div>
        </div>
      </main>
    </div>
  );
}
