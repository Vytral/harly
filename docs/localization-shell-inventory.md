# Shared shell localization inventory

This inventory covers the dashboard header, navigation, account and workspace menus, search, notifications, and shortcut dialog. It records source strings and their locations for migration; it does not imply that they are already translated. Dynamic workspace names, search results, user data, and notification content are separate from the interface labels listed here.

## Navigation and menus

- `apps/web/src/components/dashboard/nav-items.ts`: Home, Hiring, Jobs, Pipeline, Inbox, People, Candidates, Talent Pool, Team, Work, Tasks, Calendar, Reports, Career Page, Templates, Automations, Documents, Settings. The More menu hints are “Your public job board”, “Emails and scorecards”, “Run work automatically”, and “Files and signatures”. These labels also feed sub-navigation and some page headings.
- `apps/web/src/components/dashboard/AppHeader.tsx`: Main (navigation accessible name), Settings, More, Search. Translate accessible names and tooltips along with visible labels.
- `apps/web/src/components/dashboard/WorkspaceSwitcher.tsx`: Workspace and “Switch workspace, current: {workspace name}” (accessible name).
- `apps/web/src/components/dashboard/UserMenu.tsx`: Account menu, Workspace, View profile, Account settings, Organization settings, Invite teammates, Show setup checklist, Light mode, Dark mode, Star on GitHub, Public beta, Documentation, Report an issue, Sign out, Signing out…. The displayed role is supplied by `formatRole` and needs a separate review.
- `apps/web/src/components/dashboard/QuickCreateMenu.tsx`: Create, Hiring, Work; Job / “Draft and publish a new opening”; Candidate / “Add someone by hand, with their CV”; Import candidates / “CSV, Greenhouse, Lever, Ashby…”; Task / “A to-do, optionally tied to a candidate”; Interview / “Pick a slot on the calendar”.
- `apps/web/src/components/dashboard/SettingsNav.tsx`: Organization, Candidates, Automation & AI, Security & compliance, Installation; Company & brand, Members & roles, Candidate Portal, Email, Harly Signature, AI, Integrations, AI agents (MCP), Developers & API, Security, Legal & Compliance, Updates. Each entry also has a descriptive hint in this file. Search labels include “Search settings”, “Search setting”, and “Settings”.

## Search and shortcuts

- `apps/web/src/components/dashboard/CommandMenu.tsx`: Search; “Search jobs, candidates, applications, tasks and people, or jump to a page.”; “Search jobs, candidates, tasks, or jump to…”; Retry; Recent; Navigate; This candidate; Actions; Jobs, Candidates, Applications, Tasks, People. Actions include New candidate, Import candidates, New task, Go to my review queue, Keyboard shortcuts, Ask {assistant name}, Create new job, and Account settings. The footer uses navigate, select, and close.
- Search feedback includes “Search didn't load.”, Searching, “{count} result(s)”, “Remove {name} from recent searches”, “No matches for {query}”, three search tips, “Ask {assistant name} {query}”, and “See all results for {query}”. Translate count-dependent announcements with plural rules and keep names and queries as placeholders. Error text supplied by the search controller needs its own review.
- `apps/web/src/components/dashboard/shortcuts/ShortcutsDialog.tsx`: Keyboard shortcuts, Anywhere, Search and commands, Ask the assistant, then, and “Reserved: {keys}”. The description includes a keyboard key within a sentence, so preserve the element when translating.
- `apps/web/src/components/dashboard/shortcuts/catalog.ts`: General, Go to, Candidate page, Inbox and the labels for each shortcut, including navigation, candidate actions, and conversation actions. Keep shortcut identifiers, key bindings, and group logic independent of translated display text.

## Notifications

- `apps/web/src/components/dashboard/NotificationsBell.tsx`: Notifications, “Notifications ({count} unread)”, Today, Earlier, Mark all read, More notification actions, Clear all, Filter notifications, All, Unread, No unread notifications, You're all caught up, “Mentions, assignments and candidate updates land here.”, Mark as unread, Mark as read, Delete notification, Delete.
- The clear confirmation uses “Clear all notifications?”, “Every notification is deleted for you. This can't be undone.”, and “Clear all”. Failure messages cover marking one or all notifications as read, updating, deleting one, and deleting all. Count announcements need plural handling; notification bodies and relative timestamps require review at their source.
- `apps/web/src/components/dashboard/NotificationIsland.tsx`: “Your private demo sandbox — only you see your changes. It's deleted after a few hours.”

## Boundaries

The assistant panel, dashboard widgets, page-specific dialogs, emails, server errors, and stored notification bodies are outside this inventory. They need separate inventories before claiming full application coverage. Preserve product names and keyboard bindings, and review translated labels in narrow layouts and with a screen reader.
