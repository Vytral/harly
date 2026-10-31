"use client";

import { useState, type ReactNode } from "react";

/**
 * Renders a value and, when it changes after mount, re-triggers a short 4px
 * settle + fade (`.value-swap`, transform/opacity only, so no layout shift).
 * First paint is static. Non-primitive children render as-is.
 */
export function ValueSwap({ value }: { value: ReactNode }) {
  const [previous, setPrevious] = useState(value);
  const [swaps, setSwaps] = useState(0);
  const comparable = typeof value === "string" || typeof value === "number";

  if (comparable && value !== previous) {
    setPrevious(value);
    setSwaps((count) => count + 1);
  }

  if (!comparable) return <>{value}</>;
  return (
    <span key={swaps} className={swaps > 0 ? "value-swap" : undefined}>
      {value}
    </span>
  );
}
