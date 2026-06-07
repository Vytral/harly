import { Inbox } from "lucide-react";

import { ComingSoon } from "@/components/ComingSoon";

export default function InboxPage() {
  return (
    <ComingSoon
      icon={Inbox}
      title="Inbox"
      description="Your unified hiring inbox — feedback requests, mentions, and pending tasks in one place."
    />
  );
}
