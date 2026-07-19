import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getLegalPageData } from "@/features/legal/data";
import { LegalPageView } from "@/features/legal/LegalPageView";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ workspaceSlug: string; page: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspaceSlug, page } = await params;
  const data = await getLegalPageData(workspaceSlug, page);
  return data
    ? {
        title: `${data.pageTitle} , ${data.workspaceName}`,
        robots: { index: false },
      }
    : {};
}

export default async function WorkspaceLegalPage({ params }: Props) {
  const { workspaceSlug, page } = await params;
  const data = await getLegalPageData(workspaceSlug, page);
  if (!data) notFound();
  const boardRoot = `/board/${workspaceSlug}`;
  return (
    <LegalPageView
      data={data}
      legalBasePath={`${boardRoot}/legal`}
      careersHref={boardRoot}
    />
  );
}
