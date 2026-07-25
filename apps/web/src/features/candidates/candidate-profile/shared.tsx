import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Quiet label for a stacked section inside Overview / Process / Files. Uses the
 * chrome face at column-header scale so it structures without shouting , the
 * same treatment the human table gives its column heads.
 */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="type-col-head pt-1 uppercase">{children}</h3>;
}

export function TabCount({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <Badge variant="secondary" className="ml-1.5 px-1.5">
      {value}
    </Badge>
  );
}

/** Candidate sections use the shared empty state as-is. */
export { EmptyState as EmptySection };
