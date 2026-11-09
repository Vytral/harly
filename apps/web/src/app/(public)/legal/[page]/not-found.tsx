import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FileText } from "lucide-react";

export default async function LegalNotFound() {
  const t = await getTranslations("pages.legalPage.notFound");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-sage/40 text-pine">
        <FileText className="size-6" strokeWidth={1.8} />
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
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
