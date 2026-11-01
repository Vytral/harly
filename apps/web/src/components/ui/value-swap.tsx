"use client";

import type { ReactNode } from "react";
import { TextMorph } from "torph/react";

/**
 * Renders a stat value and morphs it when it changes (torph): numbers roll
 * digit by digit by place value, strings morph per character. Reduced motion
 * is respected by torph itself. Non-primitive children render as-is.
 */
export function ValueSwap({ value }: { value: ReactNode }) {
  if (typeof value !== "string" && typeof value !== "number") {
    return <>{value}</>;
  }
  return (
    <TextMorph
      as="span"
      numbers={typeof value === "number"}
      duration={350}
      ease="cubic-bezier(0.16, 1, 0.3, 1)"
      respectReducedMotion
    >
      {value}
    </TextMorph>
  );
}
