# Shared shell localization progress

This record covers static source review, not a full interactive audit. A file is complete only when every state has been exercised in all supported languages.

| File | Source migration | Remaining review |
| --- | --- | --- |
| `src/components/dashboard/UserMenu.tsx` | Menu labels and built-in roles migrated | Exercise workspace switching, demo and admin variants, custom role names and theme changes in six locales. |
| `src/components/dashboard/QuickCreateMenu.tsx` | Labels, hints and accessible trigger migrated | Exercise permission combinations and shortcut tooltip in six locales. |
| `src/components/dashboard/WorkspaceSwitcher.tsx` | Labels and accessible names migrated | Exercise one and multiple workspaces, logos and switch errors in six locales. |
| `src/components/dashboard/NotificationIsland.tsx` | Demo notice migrated | Status messages originate in callers and remain to be audited. Exercise screen reader announcement and truncation. |
| `src/components/dashboard/HarlyAILauncher.tsx` | Accessible label and tooltip migrated | Exercise open and closed states with a custom assistant name. |
| `src/components/dashboard/NotificationsBell.tsx` | Controls, errors, empty states and confirmation migrated | Notification content and relative time originate elsewhere. Exercise every filter and action in six locales. |
| `src/components/dashboard/SettingsNav.tsx` | Groups, descriptions, search and headings migrated | Exercise search, permission filtering and route headings in six locales. |
| `nav-items.ts`, `AppHeader.tsx`, `SubNav.tsx`, `ShellPageHeading.tsx` | Navigation labels, hints, headings and screen-reader labels migrated | Exercise permissions, badges, navigation and search in six locales. Verify dynamic page titles at their sources. |
| `CommandMenu.tsx` | Navigation, search UI, groups, actions and accessible labels migrated | Errors from the search controller and candidate action labels originate elsewhere. Exercise stale, loading, error and empty states in six locales. |
| `shortcuts/ShortcutsDialog.tsx` | Shortcut descriptions, groups and accessibility copy migrated | Exercise dialog, key sequences and translated layout in six locales. The catalog remains English for other callers. |
| `widgets/HomeGreeting.tsx`, `app/(dashboard)/dashboard/page.tsx` | Greetings, summary and For You row labels migrated | Six-language greeting render tests pass; dashboard still needs interactive review. |
| `widgets/TodayInterviews.tsx` | Labels, plural messages and time locale migrated | Interview label comes from dashboard data; check time zone behavior and scheduling states in six locales. |
| `widgets/InboxCard.tsx` | Labels and plurals migrated | Item title and subtitle originate in dashboard data. |
| `widgets/MyTasksCard.tsx` | Labels, dates, priorities, plurals and accessibility copy migrated | Server errors and task context originate elsewhere. Exercise optimistic completion and errors in six locales. |
| `widgets/CandidatesNeedingReview.tsx` | Labels and plurals migrated | Candidate action originates in dashboard data. Exercise empty and populated states in six locales. |
| `widgets/ForYouTodayCard.tsx` | Heading and empty state migrated | Exercise links and conditional rows in six locales. |
| `widgets/FirstRunWelcome.tsx` | Setup steps, cards and progress migrated | Exercise first-run variants and layout in six locales. |
| `widgets/SetupChecklistCard.tsx` | Checklist heading, progress, sample-data actions, skip/hide actions, copy feedback and accessible labels migrated | Step titles and CTA text come from checklist data; server action errors come from their source. Exercise collapsed/expanded, optional steps and copy feedback in six locales. |
| `widgets/IntegrationAttentionCard.tsx` | Heading, action, status labels, reconnect action and health messages migrated | Integration names are product names from health data. Exercise reconnect and degraded states in six locales. |
| `widgets/HiringPerformance.tsx`, `widgets/PerformanceChart.tsx` | KPI labels, metric selector, empty state, comparison period and chart accessible name migrated | Exercise empty/populated charts, metric selection and narrow layouts in six locales. |
| `HarlyAIPanel.tsx` | Starter labels and prompts, tool statuses, composer and history controls, write-action confirmation UI, automation proposal UI, recommendation labels and fallbacks migrated | Assistant output, canonical write previews, API and AI errors, conversation titles, candidate names, stages and other returned records are dynamic and need source review. Exercise provider unavailable, tool running/error/interrupted, delete/undo, context detach and custom assistant names in six locales. |
| `harly-ai/UiBlocks.tsx` | Candidate actions and prompts, waiting-day labels, task completion feedback, form select prompt, chart accessibility label and sent feedback migrated | Titles, candidate/task data, table columns, form options and text blocks are supplied by the AI `presentUi` result. Review those at the generation source and exercise each block type in six locales. |

Remaining: `CommandMenu`, notifications, shortcuts and shared UI components still need source and state review. The related source inventory is in `localization-shell-inventory.md`. This pass was a static review; interactive locale review remains outstanding.

The focused Harly AI test could not start because Vitest could not resolve `@harly/config/email-locale` imported by `packages/db/src/schema.ts`. ESLint passed for the dashboard components in this pass.
