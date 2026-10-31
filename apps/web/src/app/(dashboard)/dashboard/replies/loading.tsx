import { InboxSkeleton } from "@/components/skeletons";

/**
 * replies/page.tsx redirects to /dashboard/inbox?filter=replies, so the shell
 * that the user lands on is the inbox. Mirror that, not a separate list.
 */
export default function RepliesLoading() {
  return <InboxSkeleton />;
}
