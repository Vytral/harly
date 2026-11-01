import type { Metadata } from "next";

export const metadata: Metadata = { title: "Connect an AI app", robots: { index: false, follow: false } };

// Same warm-paper canvas as the staff auth screens.
export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="light relative min-h-screen overflow-hidden bg-paper text-foreground antialiased">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-sage opacity-50 blur-3xl" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
