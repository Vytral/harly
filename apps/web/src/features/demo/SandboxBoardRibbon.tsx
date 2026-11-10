import { getLocale, getTranslations } from "next-intl/server";

/**
 * Small, fixed label shown on a visitor's sandbox careers page so nobody
 * mistakes a disposable preview for a real employer's board.
 */
export async function SandboxBoardRibbon({ expiresAt }: { expiresAt: Date | null }) {
  const t = await getTranslations("features.demo.sandboxBoardRibbon");
  const locale = await getLocale();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3">
      <p
        role="status"
        className="pointer-events-auto rounded-full border border-black/10 bg-white/95 px-4 py-1.5 text-xs font-medium text-neutral-700 shadow-md backdrop-blur"
      >
        {t("preview")}
        {expiresAt ? (
          <span className="text-neutral-500">
            {" "}
            · {t("expires", {
              time: expiresAt.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }),
            })}
          </span>
        ) : null}
        {" · "}
        <a href="/dashboard/career-page" className="underline underline-offset-2">
          {t("backToBuilder")}
        </a>
      </p>
    </div>
  );
}
