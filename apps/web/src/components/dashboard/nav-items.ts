import type { Route } from "next";
import {
  BarChart3,
  Bookmark,
  Briefcase,
  CalendarDays,
  FileText,
  Globe,
  Home,
  Inbox,
  KanbanSquare,
  LayoutGrid,
  ListTodo,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/features/workspaces/permissions";

export type NavBadge = "inbox";

export type NavItem = {
  label: string;
  href: Route;
  icon: LucideIcon;
  exact?: boolean;
  badge?: NavBadge;
  /** When set, the item is hidden unless the viewer holds this permission. */
  requiredPermission?: Permission;
};

/** Primary sections — the recruiter's daily surfaces. */
export const primaryNav: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: Home, exact: true },
  { label: "Inbox", href: "/dashboard/inbox", icon: Inbox, badge: "inbox" },
];

/** Workspace tools — where the hiring work actually happens. */
export const workspaceNav: NavItem[] = [
  { label: "Jobs", href: "/dashboard/jobs", icon: Briefcase },
  { label: "Candidates", href: "/dashboard/candidates", icon: Users },
  { label: "Pipeline", href: "/dashboard/pipeline", icon: KanbanSquare },
  { label: "Reports", href: "/dashboard/reports", icon: BarChart3 },
  { label: "Tasks", href: "/dashboard/tasks", icon: ListTodo },
  { label: "Calendars", href: "/dashboard/calendars", icon: CalendarDays },
  { label: "Templates", href: "/dashboard/templates", icon: FileText },
  { label: "Talent Pool", href: "/dashboard/talent-pool", icon: Bookmark },
  { label: "Career Page", href: "/dashboard/career-page", icon: Globe },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    requiredPermission: "settings:edit",
  },
];

/** Legacy flat nav kept for the command palette / any residual consumers. */
export const navItems: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutGrid, exact: true },
  { label: "Jobs", href: "/dashboard/jobs", icon: Briefcase },
  { label: "Pipeline", href: "/dashboard/pipeline", icon: KanbanSquare },
  { label: "Candidates", href: "/dashboard/candidates", icon: Users },
];

export function isNavActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
