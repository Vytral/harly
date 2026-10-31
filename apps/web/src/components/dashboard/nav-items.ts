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
  Workflow,
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
  /** One short line for the More grid (tooltip / aria). */
  hint?: string;
  /**
   * The page at exactly this href has no heading of its own, so the shell
   * renders the label as the page title (see ShellPageHeading).
   */
  shellTitle?: boolean;
  /** Sub-navigation. A parent with children is a group pill, not a page. */
  children?: NavItem[];
};

/** A primary pill resolved against the viewer's permissions. */
export type ResolvedNavGroup = {
  item: NavItem;
  /** Where the pill goes: the first permitted child (or the item itself). */
  href: Route;
  /** Permitted sub-nav entries; empty for single destinations. */
  children: NavItem[];
};

/**
 * PRIMARY NAV , the header pills (DESIGN.md , Layout language).
 *
 * Pills are *groups*: each carries `children` that become the sub-nav row under
 * the header. A group pill links to its first permitted child, is hidden when
 * the viewer may open none of them, and reads as active when any child is.
 * Home and Reports are single destinations (no children).
 */
export const primaryNav: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: Home, exact: true },
  {
    label: "Hiring",
    href: "/dashboard/inbox",
    icon: Briefcase,
    children: [
      {
        label: "Inbox",
        shellTitle: true,
        href: "/dashboard/inbox",
        icon: Inbox,
        badge: "inbox",
        requiredPermission: "candidates:view",
      },
      {
        label: "Pipeline",
        shellTitle: true,
        href: "/dashboard/pipeline",
        icon: KanbanSquare,
        requiredPermission: "candidates:view",
      },
      {
        label: "Jobs",
        href: "/dashboard/jobs",
        icon: Briefcase,
        requiredPermission: "jobs:view",
      },
    ],
  },
  {
    label: "People",
    href: "/dashboard/candidates",
    icon: Users,
    children: [
      {
        label: "Candidates",
        href: "/dashboard/candidates",
        icon: Users,
        requiredPermission: "candidates:view",
      },
      {
        label: "Talent Pool",
        shellTitle: true,
        href: "/dashboard/talent-pool",
        icon: Bookmark,
        requiredPermission: "candidates:view",
      },
      {
        label: "Team",
        href: "/people" as Route,
        icon: UserRound,
        requiredPermission: "members:read",
      },
    ],
  },
  {
    label: "Work",
    href: "/dashboard/tasks",
    icon: ListTodo,
    children: [
      {
        label: "Tasks",
        href: "/dashboard/tasks",
        icon: ListTodo,
        badge: "tasks",
        requiredPermission: "tasks:read",
      },
      {
        label: "Calendar",
        shellTitle: true,
        href: "/dashboard/calendars",
        icon: CalendarDays,
        requiredPermission: ["interviews:manage", "interviews:feedback"],
      },
    ],
  },
  {
    label: "Reports",
    href: "/dashboard/reports",
    icon: BarChart3,
    requiredPermission: "reports:read",
  },
];

/** The "More" pill: a flat grid of occasional, set-up surfaces. */
export const moreNav: NavItem[] = [
  {
    label: "Career Page",
    href: "/dashboard/career-page",
    icon: Globe,
    requiredPermission: "settings:edit",
    hint: "Your public job board",
  },
  {
    label: "Templates",
    shellTitle: true,
    href: "/dashboard/templates",
    icon: FileText,
    requiredPermission: "templates:manage",
    hint: "Emails and scorecards",
  },
  {
    label: "Automations",
    href: "/dashboard/automations" as Route,
    icon: Workflow,
    requiredPermission: "automations:manage",
    hint: "Run work automatically",
  },
  {
    label: "Documents",
    href: "/dashboard/documents" as Route,
    icon: NotebookTabs,
    requiredPermission: ["documents:read", "templates:manage"],
    hint: "Files and signatures",
  },
];

/** Settings is rail chrome pinned to the bottom, not a primary destination. */
export const settingsNav: NavItem = {
  label: "Settings",
  href: "/settings",
  icon: Settings,
  requiredPermission: ["settings:edit", "dsar:manage"],
};

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.children?.length) {
    return item.children.some((child) => isNavActive(pathname, child));
  }
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

/**
 * Primary pills the viewer may use. Groups collapse to their first permitted
 * child and disappear when none is permitted.
 */
export function resolvePrimaryNav(
  permissions: Permission[],
): ResolvedNavGroup[] {
  const groups: ResolvedNavGroup[] = [];
  for (const item of primaryNav) {
    if (item.children) {
      const children = item.children.filter((child) =>
        hasNavPermission(child, permissions),
      );
      if (children.length === 0) continue;
      groups.push({ item, href: children[0].href, children });
    } else if (hasNavPermission(item, permissions)) {
      groups.push({ item, href: item.href, children: [] });
    }
  }
  return groups;
}

/** Flat list of leaf destinations for lookups (command menu, permission matrix). */
export function allNavItems(): NavItem[] {
  return [
    ...primaryNav.flatMap((item) => item.children ?? [item]),
    ...moreNav,
    settingsNav,
  ];
}
