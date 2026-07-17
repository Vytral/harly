import { SetupBrandPanel } from "./SetupBrandPanel";

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[100dvh] bg-paper text-foreground antialiased md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Brand panel , evergreen, hidden on mobile (its logo re-appears in the
          right panel below md). */}
      <SetupBrandPanel />

      {/* Claim panel */}
      <div className="relative flex min-h-[100dvh] flex-col overflow-hidden md:min-h-0">
        {/* Warm lime wash bleeding down from the top, matching the auth shell. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="absolute -top-40 left-1/2 h-[440px] w-[680px] -translate-x-1/2 rounded-full bg-sage opacity-40 blur-3xl md:opacity-30" />
        </div>
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
