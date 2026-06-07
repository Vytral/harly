import type { Route } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ slug: string; jobSlug: string }>;
};

export default async function BoardJobDetailRedirect({ params }: Params) {
  const { jobSlug } = await params;
  redirect(`/jobs/${jobSlug}` as Route);
}
