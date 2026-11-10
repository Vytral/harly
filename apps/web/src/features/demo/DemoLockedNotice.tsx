import { useTranslations } from "next-intl";

/**
 * Quiet notice for settings surfaces that stay visible in the demo but cannot
 * mutate identity or open real egress. Server actions still enforce the guard.
 */
export function DemoLockedNotice({ children }: { children?: string }) {
  const t = useTranslations("features.demo.demoLockedNotice");
  return (
    <p
      role="status"
      className="rounded-lg border border-hairline bg-sage-wash px-3.5 py-2.5 text-sm text-sage-ink"
    >
      {children ?? t("default")}
    </p>
  );
}
