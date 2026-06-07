import type { ReactNode } from "react";

import { SettingsNav } from "@/components/dashboard/SettingsNav";

export const dynamic = "force-dynamic";

export default function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your organization profile, team, and integrations.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[212px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <SettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
