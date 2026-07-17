import Image from "next/image";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { OnboardingSignOut } from "./onboarding/_components/OnboardingSignOut";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getWorkspaceContextOrNull({
    fallbackToFirstOrganization: true,
  });
  const logo = context?.organization.logo;
  const orgName = context?.organization.name;

  return (
    <div className="light relative flex min-h-screen flex-col bg-paper text-foreground antialiased">
      {/* Soft on-brand wash, warm paper with a single evergreen tint. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-sage opacity-60 blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-center pt-10">
        {logo ? (
          <Image
            src={logo}
            alt={orgName ?? "Workspace"}
            width={140}
            height={40}
            className="h-10 w-auto object-contain"
            unoptimized
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/harly-full-black.svg" alt="Harly" className="h-8 w-auto" />
        )}
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
        {children}
      </main>

      <footer className="relative z-10 flex items-center justify-center pb-8">
        <OnboardingSignOut />
      </footer>
    </div>
  );
}
