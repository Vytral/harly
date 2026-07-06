import { InboxList } from "@/features/notifications/InboxList";
import { listNotifications } from "@/features/notifications/data";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const items = await listNotifications();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <InboxList items={items} />
    </div>
  );
}
