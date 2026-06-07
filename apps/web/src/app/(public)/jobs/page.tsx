import type { Route } from "next";
import { redirect } from "next/navigation";

import { getPublicWorkspaceSlug } from "@/lib/public-workspace";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const slug = await getPublicWorkspaceSlug();
  if (!slug) redirect("/setup" as Route);
  redirect("/" as Route);
}
