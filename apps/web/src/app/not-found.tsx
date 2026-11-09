import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("pages.root.notFound");
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
      <span className="font-display text-[7rem] font-bold leading-none tracking-tighter text-sage select-none sm:text-[9rem]">
        404
      </span>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
        {t("title")}
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t("description")}
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-9 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-pine-strong"
      >
        {t("backToCareers")}
      </Link>
    </div>
  );
}
