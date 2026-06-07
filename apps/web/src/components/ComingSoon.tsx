import { Sparkles, type LucideIcon } from "lucide-react";

/**
 * Honest placeholder for sidebar sections that are navigable but not built yet.
 * Sits on the paper canvas; no fabricated data, just a clear "what lands here".
 */
export function ComingSoon({
  title,
  description,
  icon: Icon = Sparkles,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="size-6" strokeWidth={1.6} />
      </span>
      <h1 className="mt-4 text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      <span className="mt-5 inline-flex items-center rounded-full border border-dashed px-3 py-1 text-xs font-medium text-muted-foreground">
        Coming soon
      </span>
    </div>
  );
}
