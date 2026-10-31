import { cn } from "@/lib/utils";

/** One key chip. Tokens only, so it follows light and dark themes. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-[var(--radius-btn)] border border-hairline bg-card-inset px-1.5 font-chrome text-[12px] font-medium leading-none text-near-ink",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
