import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DocumentTemplatesPage() {
  redirect("/dashboard/documents?view=templates");
}
