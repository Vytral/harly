import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-shimmer rounded-[var(--radius-md)] bg-soft-kraft", className)}
      {...props}
    />
  )
}

export { Skeleton }
