import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";

export function DocumentsWorkspaceTabs({
  active,
  canReadDocuments,
  canManageTemplates,
}: {
  active: "files" | "templates";
  canReadDocuments: boolean;
  canManageTemplates: boolean;
}) {
  const t = useTranslations("features.documents.documentsWorkspaceTabs");
  return (
    <nav
      aria-label={t("label")}
      className="flex w-fit gap-1 rounded-full bg-soft-kraft p-1"
    >
      {canReadDocuments ? (
        <Link
          href={"/dashboard/documents" as Route}
          aria-current={active === "files" ? "page" : undefined}
          className={
            active === "files"
              ? "rounded-full bg-pure-snow px-3.5 py-1.5 text-sm font-medium text-near-ink"
              : "rounded-full px-3.5 py-1.5 text-sm text-soft-ink transition-colors hover:text-near-ink"
          }
        >
          {t("files")}
        </Link>
      ) : null}
      {canManageTemplates ? (
        <Link
          href={"/dashboard/documents?view=templates" as Route}
          aria-current={active === "templates" ? "page" : undefined}
          className={
            active === "templates"
              ? "rounded-full bg-pure-snow px-3.5 py-1.5 text-sm font-medium text-near-ink"
              : "rounded-full px-3.5 py-1.5 text-sm text-soft-ink transition-colors hover:text-near-ink"
          }
        >
          {t("workflowTemplates")}
        </Link>
      ) : null}
    </nav>
  );
}
