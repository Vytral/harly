import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getLegalPageData } from "@/features/legal/data";
import { LegalPageView } from "@/features/legal/LegalPageView";
import { getPublicWorkspaceSlug } from "@/lib/public-workspace";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ page: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await params;
  const slug = await getPublicWorkspaceSlug();
  const data = slug ? await getLegalPageData(slug, page) : null;
  return data
    ? {
        title: `${data.pageTitle} , ${data.workspaceName}`,
        robots: { index: false },
      }
    : {};
}

export default async function LegalPage({ params }: Props) {
  const { page } = await params;
  const slug = await getPublicWorkspaceSlug();
  const data = slug ? await getLegalPageData(slug, page) : null;
  if (!data) notFound();
  return <LegalPageView data={data} legalBasePath="/legal" careersHref="/" />;
}
