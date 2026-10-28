import { CardListSkeleton, PageHeaderSkeleton } from "@/components/skeletons";

export default function DocumentTemplatesLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading document templates">
      <PageHeaderSkeleton actionCount={1} />
      <CardListSkeleton count={4} avatar={false} lines={2} trailing="badge" />
    </div>
  );
}
