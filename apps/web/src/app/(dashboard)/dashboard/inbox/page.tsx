import { InboxList } from "@/features/notifications/InboxList";
import { listNotifications } from "@/features/notifications/data";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const items = await listNotifications();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Inbox
        </p>
        <h1 className="font-display text-xl font-semibold tracking-tight">
          Notifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mentions and updates addressed to you in this workspace.
        </p>
      </div>
      <InboxList items={items} />
    </div>
  );
}
