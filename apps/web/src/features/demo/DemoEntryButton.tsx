import { isDemoMode } from "@harly/config";

/**
 * Floating "try the demo" call-to-action, fixed to the bottom-right of the
 * public career board. Renders only when DEMO_MODE=true, so normal Harly
 * installs show nothing new on their board. Links to the dedicated /enter
 * page (shared credentials + Turnstile).
 */
export function DemoEntryButton() {
  if (!isDemoMode()) return null;

  return (
    <a
      href="/enter"
      className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-pine-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M13 5l7 7-7 7M20 12H4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Explore the ATS
    </a>
  );
}
