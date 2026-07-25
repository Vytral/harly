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
  ListTodo,
  NotebookTabs,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/features/workspaces/permissions";

export type NavBadge = "inbox" | "tasks";

export type NavItem = {
  label: string;
  href: Route;
  icon: LucideIcon;
  exact?: boolean;
  badge?: NavBadge;
  /** When set, the item is hidden unless the viewer holds this permission. */
  requiredPermission?: Permission | Permission[];
  /** One short line shown in the More menu. Rail items don't need it. */
  hint?: string;
};

/**
 * PRIMARY NAV , the icon rail. Hard cap: 5 destinations (DESIGN.md).
 *
 * A recruiter does not think in modules. They ask three questions: who came in
 * today, who needs me to move or answer them, and which role is stuck. These
 * four answer all three. Everything else is a place you *visit*, not a place
 * you live, so it belongs in `moreNav`.
 *
 * Adding an item here requires updating DESIGN.md first , it is a hard ban.
 */
export const primaryNav: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: Home, exact: true },
  { label: "Inbox", href: "/dashboard/inbox", icon: Inbox, badge: "inbox" },
  { label: "Pipeline", href: "/dashboard/pipeline", icon: KanbanSquare },
  { label: "Jobs", href: "/dashboard/jobs", icon: Briefcase },
];

export type MoreGroup = { label: string; items: NavItem[] };

/**
 * Everything behind More , the 5th rail slot. Grouped so the popover reads as
 * a short index instead of the 14-item warehouse the rail used to be.
 */
export const moreNav: MoreGroup[] = [
  {
    label: "People",
    items: [
      {
        label: "Candidates",
        href: "/dashboard/candidates",
        icon: Users,
        hint: "Full directory and search",
      },
      {
        label: "Talent Pool",
        href: "/dashboard/talent-pool",
        icon: Bookmark,
        hint: "Saved for later",
      },
      {
        label: "Team",
        href: "/people" as Route,
        icon: UserRound,
        hint: "Your colleagues",
      },
    ],
  },
  {
    label: "Work",
    items: [
      {
        label: "Tasks",
        href: "/dashboard/tasks",
        icon: ListTodo,
        badge: "tasks",
        hint: "Assigned to you",
      },
      {
        label: "Calendar",
        href: "/dashboard/calendars",
        icon: CalendarDays,
        hint: "Interviews and availability",
      },
      {
        label: "Reports",
        href: "/dashboard/reports",
        icon: BarChart3,
        hint: "Funnel, sources, time to hire",
      },
    ],
  },
  {
    label: "Set up",
    items: [
      {
        label: "Career Page",
        href: "/dashboard/career-page",
        icon: Globe,
        requiredPermission: "settings:edit",
        hint: "Your public job board",
      },
      {
        label: "Templates",
        href: "/dashboard/templates",
        icon: FileText,
        requiredPermission: "templates:manage",
        hint: "Emails and scorecards",
      },
      {
        label: "Documents",
        href: "/dashboard/documents" as Route,
        icon: NotebookTabs,
        requiredPermission: "documents:read",
        hint: "Requests, signatures, retention",
      },
    ],
  },
];

/** Settings is rail chrome pinned to the bottom, not a primary destination. */
export const settingsNav: NavItem = {
  label: "Settings",
  href: "/settings",
  icon: Settings,
  requiredPermission: ["settings:edit", "dsar:manage"],
};

export function isNavActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function hasNavPermission(item: NavItem, permissions: Permission[]) {
  if (!item.requiredPermission) return true;
  return Array.isArray(item.requiredPermission)
    ? item.requiredPermission.some((permission) =>
        permissions.includes(permission),
      )
    : permissions.includes(item.requiredPermission);
}

/** Flat list for lookups (command menu, active-section resolution). */
export function allNavItems(): NavItem[] {
  return [
    ...primaryNav,
    ...moreNav.flatMap((group) => group.items),
    settingsNav,
  ];
}
