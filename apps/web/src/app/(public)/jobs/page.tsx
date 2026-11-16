import type { Route } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The root page owns the "no workspace yet" case (it redirects to /setup).
export default function JobsPage() {
  redirect("/" as Route);
}
