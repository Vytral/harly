import { listEmailTemplates } from "@/features/email-templates/data";
import { TemplatesManager } from "@/features/email-templates/TemplatesManager";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listEmailTemplates();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Templates
        </p>
        <h1 className="font-display text-xl tracking-tight">Email templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reusable messages with per-candidate variables, available from every
          email drawer.
        </p>
      </div>
      <TemplatesManager templates={templates} />
    </div>
  );
}
