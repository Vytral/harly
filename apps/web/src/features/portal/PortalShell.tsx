import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";

import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { signOutPortalAction } from "@/features/portal/actions";
import { Button } from "@/components/ui/button";

export async function PortalShell({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href={"/portal/dashboard" as Route} className="text-sm font-semibold">
              My Portal
            </Link>
            <nav className="hidden items-center gap-4 sm:flex">
              <Link
                href={"/portal/dashboard" as Route}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Applications
              </Link>
              <Link
                href={"/portal/jobs" as Route}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Open roles
              </Link>
              <Link
                href={"/portal/profile" as Route}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Profile
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:block">
              {session.firstName} {session.lastName}
            </span>
            <form action={signOutPortalAction}>
              <Button variant="ghost" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        {children}
      </main>
    </div>
  );
}
