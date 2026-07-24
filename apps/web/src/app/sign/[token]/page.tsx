import { NativeSigningPage } from "./NativeSigningPage";

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <NativeSigningPage token={token} />;
}
