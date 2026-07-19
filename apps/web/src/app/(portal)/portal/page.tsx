import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";

import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (token) {
    const session = await resolvePortalSession(token);
    if (session) redirect("/portal/dashboard" as Route);
  }
  redirect("/portal/login" as Route);
}
