import { PageHeaderSkeleton, CardListSkeleton } from "@/components/skeletons";

export default function AdminLoading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton hasActions={false} />
      <CardListSkeleton count={8} avatar={false} lines={1} trailing="text" />
    </div>
  );
}
