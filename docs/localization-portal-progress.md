# Candidate portal localization progress

| File | Status | Remaining work |
| --- | --- | --- |
| `src/features/portal/PortalSignOutButton.tsx` | Migrated | Verify in browser for each locale. |
| `src/features/portal/PortalNextStep.tsx` | Partially migrated | Waiting-state headline and body are supplied by the dashboard and progress helpers. Review those sources, and test all four variants. |
| `src/features/portal/application-progress.ts` | Pending | Localize presentation strings without translating stage names supplied by the organization; preserve domain behavior. |
| `src/app/(portal)/portal/dashboard/page.tsx` | Pending | Review every state, including waiting copy and formatting. |
| `src/features/portal/PortalTopNav.tsx` | Migrated | Verify desktop and mobile navigation, account menu and unread counts in each locale. |
| `src/features/portal/PortalStageProgress.tsx` | Migrated | Six-locale static render test passes; verify interactive flow. |
| `src/features/portal/PortalNotificationsList.tsx` | Partially migrated | Notification title/body are persisted backend content and RelativeTime still requires localization. Test confirmations and actions. |
| `src/features/portal/PortalInterviewItem.tsx` | Migrated | Verify date/time and calendar downloads in each locale and timezone. |
| `src/features/portal/PortalProfileCompletionCard.tsx`, `profile-completion.ts` | Migrated | Field keys replace English labels; test localized list formatting and UI states. |
| `src/features/portal/PortalOfferSignCard.tsx`, `PortalOfferSignDialog.tsx` | Partially migrated | Signing dependencies and server errors remain in English; verify all states and obtain fluent review of consent wording before release. |
| Other portal routes and features | Pending | Inventory each file and conditional state before marking this domain complete. |
