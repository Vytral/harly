"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

import {
  EyeIcon,
  EyeSlashDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";

/**
 * Bias-reduced review shell. When anonymization is on, identity signals wrapped
 * in <Redact> are visually masked (blur + non-selectable) until the reviewer
 * explicitly reveals this one candidate. The reveal is per-candidate and never
 * persisted — reload returns to the masked state.
 *
 * Blur (not deletion) keeps the layout intact and makes the redaction honest:
 * the reviewer chooses to look, rather than the data being hidden from the
 * record. Deterministic and explainable — no model call.
 */

// Default `true` (revealed) so that when anonymization is OFF and no provider is
// mounted (IdentityShield returns children directly), <Redact>/<RedactLink>
// render normally instead of blurring. Inside an active shield the provider
// supplies the real `revealed` state (false = masked until the reviewer opts in).
const RevealContext = createContext(true);

export function IdentityShield({
  anonymize,
  children,
}: {
  anonymize: boolean;
  children: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);

  if (!anonymize) return <>{children}</>;

  return (
    <RevealContext.Provider value={revealed}>
      <div className="relative">
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-pine/20 bg-sage/25 px-3 py-2">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-pine">
            <EyeSlashDuotoneIcon className="size-4 shrink-0" />
            {revealed
              ? "Identity revealed for this candidate"
              : "Anonymized to reduce bias"}
          </span>
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-pressed={revealed}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-pine/25 bg-card px-2.5 py-1",
              "text-xs font-medium text-pine transition-[transform,background-color]",
              "duration-150 ease-out hover:bg-sage/40 active:scale-[0.97]",
            )}
          >
            <EyeIcon className="size-3.5" />
            {revealed ? "Hide identity" : "Reveal identity"}
          </button>
        </div>
        {children}
      </div>
    </RevealContext.Provider>
  );
}

/**
 * Masks its children when the surrounding IdentityShield is anonymized and not
 * yet revealed. Used with no shield present, it renders children untouched.
 */
export function Redact({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const revealed = useContext(RevealContext);
  return (
    <span
      className={cn(
        "transition-[filter] duration-200 ease-out",
        !revealed &&
          "pointer-events-none select-none blur-[6px] [text-shadow:0_0_10px_rgba(0,0,0,0.28)]",
        className,
      )}
      // Hide the underlying text from assistive tech + copy while masked.
      aria-hidden={!revealed}
    >
      {children}
    </span>
  );
}

/**
 * A link whose identifying href (mailto:/tel:/profile URL) is withheld until
 * the reviewer reveals this candidate. While masked the anchor carries no href
 * at all — so the raw value never appears in the DOM, on hover, or via copy —
 * and its label is blurred like <Redact>. This closes the gap where blurred
 * text still leaked PII through the underlying href.
 */
export function RedactLink({
  href,
  children,
  className,
  target,
  rel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  target?: string;
  rel?: string;
}) {
  const revealed = useContext(RevealContext);
  return (
    <a
      href={revealed ? href : undefined}
      target={revealed ? target : undefined}
      rel={revealed ? rel : undefined}
      aria-hidden={!revealed}
      className={cn(
        "transition-[filter] duration-200 ease-out",
        !revealed &&
          "pointer-events-none select-none blur-[6px] [text-shadow:0_0_10px_rgba(0,0,0,0.28)]",
        className,
      )}
    >
      {children}
    </a>
  );
}
