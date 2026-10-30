import { CardListSkeleton, PageHeaderSkeleton } from "@/components/skeletons";

export default function AutomationsLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading automations">
      <PageHeaderSkeleton actionCount={2} />
      <CardListSkeleton count={4} avatar={false} lines={2} trailing="badge" />
    </div>
  );
}
