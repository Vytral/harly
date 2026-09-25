import Link from "next/link";
import type { Route } from "next";

export function DocumentsWorkspaceTabs({
  active,
  canReadDocuments,
  canManageTemplates,
}: {
  active: "files" | "templates";
  canReadDocuments: boolean;
  canManageTemplates: boolean;
}) {
  return (
    <nav
      aria-label="Documents workspace"
      className="flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1"
    >
      {canReadDocuments ? (
        <Link
          href={"/dashboard/documents" as Route}
          aria-current={active === "files" ? "page" : undefined}
          className={
            active === "files"
              ? "rounded-md bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
              : "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          Files
        </Link>
      ) : null}
      {canManageTemplates ? (
        <Link
          href={"/dashboard/documents?view=templates" as Route}
          aria-current={active === "templates" ? "page" : undefined}
          className={
            active === "templates"
              ? "rounded-md bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
              : "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          Workflow templates
        </Link>
      ) : null}
    </nav>
  );
}
