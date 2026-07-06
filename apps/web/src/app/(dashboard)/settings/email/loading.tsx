import { FormSkeleton } from "@/components/skeletons";

export default function EmailSettingsLoading() {
  return (
    <div className="space-y-6">
      <FormSkeleton fields={4} />
      <FormSkeleton fields={3} />
    </div>
  );
}
