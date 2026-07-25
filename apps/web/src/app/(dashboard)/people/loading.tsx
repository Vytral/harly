import { CardListSkeleton, PageHeaderSkeleton } from "@/components/skeletons";

export default function PeopleLoading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton hasActions={false} />
      <CardListSkeleton count={8} avatar lines={1} trailing="text" />
    </div>
  );
}
