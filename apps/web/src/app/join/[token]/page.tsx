import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { JoinWorkspaceButton } from "@/features/workspaces/JoinWorkspaceButton";
import { getWorkspaceByInviteToken } from "@/features/workspaces/data";

type JoinPageProps = {
  params: Promise<{ token: string }>;
};

export default async function JoinPage({ params }: JoinPageProps) {
  const { token } = await params;
  const workspace = await getWorkspaceByInviteToken(token);

  if (!workspace) {
    notFound();
  }

  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        <Link href="/" className="font-display text-lg tracking-tight text-pine">
          Harly
        </Link>
        {!session ? (
          <Link
            href={`/login?redirect=${encodeURIComponent(`/join/${token}`)}`}
            className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            Sign in
          </Link>
        ) : null}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-20">
        {workspace.organizationLogo && (
          <div className="mb-6">
            <Image
              src={workspace.organizationLogo}
              alt={workspace.organizationName}
              width={56}
              height={56}
              className="h-14 w-14 rounded-xl object-cover"
              unoptimized
            />
          </div>
        )}

        <div className="w-full max-w-sm">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-pine">
            Invitation
          </p>
          <h1 className="mt-3 text-center font-display text-3xl tracking-tight text-foreground">
            Join {workspace.organizationName}
          </h1>
          <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">
            You&apos;ll join as{" "}
            <span className="font-semibold capitalize text-foreground">
              {workspace.role.replace("_", " ")}
            </span>
            .
          </p>

          <div className="mt-10">
            {!session ? (
              <div className="space-y-3">
                <Link
                  href={`/login?redirect=${encodeURIComponent(`/join/${token}`)}`}
                  className="block w-full rounded-lg bg-primary py-3.5 text-center text-sm font-semibold text-primary-foreground transition hover:bg-pine-strong"
                >
                  Sign in to join
                </Link>
                <p className="text-center text-xs text-muted-foreground">
                  Sign in or create an account to join this workspace.
                </p>
              </div>
            ) : (
              <JoinWorkspaceButton token={token} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
