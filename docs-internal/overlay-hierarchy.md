# Overlay hierarchy

Use the smallest surface that preserves context and lets the user finish the task comfortably. A drawer is not the default answer.

| Surface | Use it for | Do not use it for |
| --- | --- | --- |
| Menu | A small list of immediately available actions from a trigger. | Forms, previews, or destructive confirmations. |
| Popover | A focused, anchored choice: filters, a date, an assignee, or short help. | Multi-step work or long scrolling content. |
| Dialog | A discrete decision, confirmation, or short form that interrupts the current task. | Editors, setup flows, or anything that needs persistent context. |
| Side panel | Reviewing or editing one contextual record while keeping the list, pipeline, or profile behind it visible. | Long-form editing, tables, multi-step setup, or a workflow with its own navigation. |
| Full page | A substantial workflow with multiple sections, rich editing, preview, history, or deep links. | A one-field edit or confirmation. |
| Mobile bottom sheet | The mobile form of a contextual side panel. It must be draggable, keyboard-safe, and have a persistent action area. | Full-page workflows disguised as a sheet. |

## Product rules

1. A menu or popover must complete in one glance. If it scrolls materially, promote it.
2. A dialog has one decision or a short form. Prefer a side panel after roughly five fields or when the user must refer to the underlying page.
3. A side panel is for a single entity and one bounded task. It has a fixed header, scrollable body, and fixed actions.
4. A flow requiring a rich-text editor, data mapping, permissions matrix, preview, or more than one major section belongs on a page or a deliberately wide workspace.
5. Desktop side panels open from the right. On mobile, `SidePanel` and `Sheet mobilePresentation="bottom-on-mobile"` become a Vaul bottom sheet. Do not create a separate mobile implementation for each feature.
6. Nested overlays are an exception. Close or promote the parent flow instead of stacking dialog over drawer over popover.

## Current migration map

| Keep as `SidePanel` | Promote to full page or large workspace |
| --- | --- |
| Edit candidate, evaluation, schedule/reschedule, offer, individual email, short integration configuration | Candidate import, email template editor, roles and permissions, enterprise SSO configuration |

## Migration status

- Completed: AI configuration (`/settings/ai/configure`), email delivery configuration (`/settings/email/configure`), and reply handling (`/settings/email/replies`) use dedicated routes. Their Settings cards remain concise status and control overviews.
- Completed: Candidate profile and candidate action bar now use the same `ScheduleDrawer` surface. The older `ScheduleDialog` no longer has a runtime caller.
- Next: roles and enterprise SSO. These remain in wide panels until their dedicated workflows are extracted.

The migration starts with `EditCandidateDrawer`. New contextual panels must use `@/components/ui/side-panel`; existing `DrawerLayout` callers should move as they are touched. Do not add new callers to `DrawerLayout`. Every surviving drawer must opt into `mobilePresentation="bottom-on-mobile"` unless its mobile form is intentionally a side navigation.
