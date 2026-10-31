import type { Metadata } from "next";

import { NativeSigningPage } from "./NativeSigningPage";

// Personal bearer link: keep it out of search indexes and out of Referer headers.
export const metadata: Metadata = {
  title: "Review and sign",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <NativeSigningPage token={token} />;
}
