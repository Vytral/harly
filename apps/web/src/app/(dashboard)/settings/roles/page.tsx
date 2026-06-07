import { redirect } from "next/navigation";

// Roles now live alongside members under one "Members & roles" page.
export default function RolesRedirectPage() {
  redirect("/settings/members");
}
