import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getLegalIndexData } from "@/features/legal/data";
import { LegalIndexView } from "@/features/legal/LegalIndexView";
import { getPublicWorkspaceSlug } from "@/lib/public-workspace";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const slug = await getPublicWorkspaceSlug();
  const data = slug ? await getLegalIndexData(slug) : null;
  return data
    ? {
        title: `Legal & privacy · ${data.workspaceName}`,
        robots: { index: false },
      }
    : {};
}

export default async function LegalIndexPage() {
  const slug = await getPublicWorkspaceSlug();
  const data = slug ? await getLegalIndexData(slug) : null;
  if (!data) notFound();
  return <LegalIndexView data={data} legalBasePath="/legal" careersHref="/" />;
}
