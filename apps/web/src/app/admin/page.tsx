import type { Route } from "next";
import { redirect } from "next/navigation";

export default function AdminPage() {
  redirect("/dashboard" as Route);
}
