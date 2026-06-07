import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { AcceptInvitationButton } from "@/features/workspaces/AcceptInvitationButton";
import { getInvitationById } from "@/features/workspaces/data";

type InvitePageProps = {
  params: Promise<{
    invitationId: string;
  }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { invitationId } = await params;
  const invitation = await getInvitationById(invitationId);

  if (!invitation) {
    notFound();
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const isExpired = invitation.expiresAt < new Date();
  const isRecipient =
    session?.user.email.trim().toLowerCase() ===
    invitation.email.trim().toLowerCase();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f1] px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-500">
          OpenHire
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          Join {invitation.organizationName}
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          You were invited as{" "}
          <span className="font-semibold capitalize text-stone-800">
            {invitation.role.replace("_", " ")}
          </span>{" "}
          using {invitation.email}.
        </p>

        <div className="mt-8">
          {invitation.status !== "pending" ? (
            <p className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-600">
              This invitation is {invitation.status}.
            </p>
          ) : isExpired ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              This invitation has expired.
            </p>
          ) : !session ? (
            <div className="space-y-3">
              <p className="text-sm text-stone-500">
                Sign in or create an account with {invitation.email} to accept.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href="/login"
                  className="rounded-2xl border border-stone-300 px-4 py-3 text-center text-sm font-semibold text-stone-900 transition hover:border-stone-500"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-2xl bg-red-500 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-red-600"
                >
                  Create account
                </Link>
              </div>
            </div>
          ) : !isRecipient ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              You are signed in as {session.user.email}. This invitation belongs
              to {invitation.email}.
            </p>
          ) : (
            <AcceptInvitationButton invitationId={invitation.id} />
          )}
        </div>
      </section>
    </main>
  );
}
