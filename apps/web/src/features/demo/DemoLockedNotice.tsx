/**
 * Quiet notice for settings surfaces that stay visible in the demo but cannot
 * mutate identity or open real egress. Server actions still enforce the guard.
 */
export function DemoLockedNotice({
  children = "Disabled in the live demo — this action would persist past the periodic reset or send data outside the sandbox.",
}: {
  children?: string;
}) {
  return (
    <p
      role="status"
      className="rounded-lg border border-hairline bg-sage-wash px-3.5 py-2.5 text-sm text-sage-ink"
    >
      {children}
    </p>
  );
}
