import { FormSkeleton } from "@/components/skeletons";

/** The AI settings page is a stack of form cards, so the placeholder is a form. */
export default function AiSettingsLoading() {
  return <FormSkeleton fields={4} />;
}
