import { FormSkeleton } from "@/components/skeletons";

/**
 * settings/layout.tsx already renders the real sidebar around this slot , this
 * only covers the content column, so it must NOT render SettingsSkeleton
 * (that duplicates the nav/grid and nests a second sidebar during load).
 */
export default function SettingsLoading() {
  return <FormSkeleton fields={3} />;
}
