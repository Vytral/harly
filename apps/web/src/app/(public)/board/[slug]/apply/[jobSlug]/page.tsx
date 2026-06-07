import type { Route } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ slug: string; jobSlug: string }>;
};

export default async function BoardApplyRedirect({ params }: Params) {
  const { jobSlug } = await params;
  redirect(`/apply/${jobSlug}` as Route);
}
