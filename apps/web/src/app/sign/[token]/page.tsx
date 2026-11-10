import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { NativeSigningPage } from "./NativeSigningPage";

// Personal bearer link: keep it out of search indexes and out of Referer headers.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.sign.page");
  return {
    title: t("metadataTitle"),
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <NativeSigningPage token={token} />;
}
