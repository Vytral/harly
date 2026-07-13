import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RepliesPage() {
  redirect("/dashboard/inbox?filter=replies");
}
