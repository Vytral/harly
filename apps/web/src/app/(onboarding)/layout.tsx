import { OnboardingSignOut } from "./onboarding/_components/OnboardingSignOut";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-paper">
      {/* Soft on-brand wash — warm paper, single evergreen tint. No rainbow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-sage opacity-60 blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-center pt-10">
        <span className="font-display text-2xl tracking-tight text-pine">
          OpenHire
        </span>
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
