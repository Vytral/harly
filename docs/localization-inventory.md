# Localization inventory

This inventory lists route entry points and the code areas that supply visible copy. It is a review queue, not a catalog of every string. Components, shared libraries, API errors, database content and conditional UI can supply text outside the route files. A route is complete only after its reachable states and dependencies have been reviewed.

## Scope and order

| Pass | Surfaces and source areas | Review |
| --- | --- | --- |
| 1 | Shared shell: `apps/web/src/components`, root layouts, navigation, menus, dialogs, cookie consent, global errors | Visible text, accessible names, keyboard hints, placeholders, tooltips, toast messages, loading and empty states |
| 2 | Authentication and setup: `(auth)`, `setup`, `enter`, `invite`, `join`, `change-password`, `setup-2fa`, `no-workspace`, `oauth` | Forms, validation, server failures, redirects and email links |
| 3 | Recruiter dashboard: `(dashboard)`, `(fullscreen)`, corresponding `src/features/*` | Jobs, candidates, pipeline, interviews, tasks, inbox, reports, documents, automations and all detail/edit flows |
| 4 | Workspace and account: `(dashboard)/settings`, `account`, `src/features/workspaces`, `security`, `integrations`, `developers` | Roles, integrations, destructive confirmations, feature availability and errors |
| 5 | Candidate-facing flows: `(public)`, `(portal)`, `sign`, `src/features/public-job`, `portal`, `applications`, `career-page` | Job boards, application forms, portal, signing, legal pages and states requiring tokens |
| 6 | Email: `packages/emails/src/templates`, sender and call sites; `src/features/email-templates`, `email-outbox` | Subjects, preheaders, body, actions, alternative text, calendar details and fallback links |
| 7 | Cross-cutting: `packages/validators`, `apps/web/src/app/api`, `apps/web/src/lib`, notifications, generated documents | Trace errors and notification copy to user-facing displays; distinguish machine contracts and user content |

## Route entry points

Each path below is a review starting point. Include adjacent `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, route-specific components and imported features. Dynamic segments need representative records and failure cases.

### (auth)

- `apps/web/src/app/(auth)/forgot-password/page.tsx`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(auth)/reset-password/page.tsx`
- `apps/web/src/app/(auth)/signup/page.tsx`

### (dashboard)

- `apps/web/src/app/(dashboard)/account/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/automations/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/calendars/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/candidates/[candidateId]/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/candidates/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/document-templates/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/documents/[documentId]/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/documents/[documentId]/sign/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/documents/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/inbox/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/jobs/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/pipeline/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/replies/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/reports/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/talent-pool/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/tasks/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/templates/page.tsx`
- `apps/web/src/app/(dashboard)/people/[username]/page.tsx`
- `apps/web/src/app/(dashboard)/people/page.tsx`
- `apps/web/src/app/(dashboard)/settings/ai/configure/page.tsx`
- `apps/web/src/app/(dashboard)/settings/ai/page.tsx`
- `apps/web/src/app/(dashboard)/settings/ai-agents/page.tsx`
- `apps/web/src/app/(dashboard)/settings/developers/page.tsx`
- `apps/web/src/app/(dashboard)/settings/email/configure/page.tsx`
- `apps/web/src/app/(dashboard)/settings/email/page.tsx`
- `apps/web/src/app/(dashboard)/settings/email/replies/page.tsx`
- `apps/web/src/app/(dashboard)/settings/integrations/[slug]/page.tsx`
- `apps/web/src/app/(dashboard)/settings/integrations/page.tsx`
- `apps/web/src/app/(dashboard)/settings/legal/page.tsx`
- `apps/web/src/app/(dashboard)/settings/members/page.tsx`
- `apps/web/src/app/(dashboard)/settings/page.tsx`
- `apps/web/src/app/(dashboard)/settings/portal/page.tsx`
- `apps/web/src/app/(dashboard)/settings/roles/page.tsx`
- `apps/web/src/app/(dashboard)/settings/security/page.tsx`
- `apps/web/src/app/(dashboard)/settings/signature/page.tsx`
- `apps/web/src/app/(dashboard)/settings/updates/page.tsx`

### (fullscreen)

- `apps/web/src/app/(fullscreen)/dashboard/automations/[id]/page.tsx`
- `apps/web/src/app/(fullscreen)/dashboard/career-page/page.tsx`
- `apps/web/src/app/(fullscreen)/dashboard/document-templates/[templateId]/page.tsx`
- `apps/web/src/app/(fullscreen)/dashboard/documents/templates/[templateId]/page.tsx`
- `apps/web/src/app/(fullscreen)/dashboard/jobs/[jobId]/page.tsx`
- `apps/web/src/app/(fullscreen)/dashboard/jobs/new/page.tsx`
- `apps/web/src/app/(fullscreen)/dashboard/templates/[templateId]/page.tsx`

### (onboarding)

- `apps/web/src/app/(onboarding)/onboarding/page.tsx`

### (portal)

- `apps/web/src/app/(portal)/portal/access/page.tsx`
- `apps/web/src/app/(portal)/portal/applications/[applicationId]/page.tsx`
- `apps/web/src/app/(portal)/portal/applications/page.tsx`
- `apps/web/src/app/(portal)/portal/dashboard/page.tsx`
- `apps/web/src/app/(portal)/portal/jobs/[jobId]/page.tsx`
- `apps/web/src/app/(portal)/portal/jobs/page.tsx`
- `apps/web/src/app/(portal)/portal/login/page.tsx`
- `apps/web/src/app/(portal)/portal/notifications/page.tsx`
- `apps/web/src/app/(portal)/portal/page.tsx`
- `apps/web/src/app/(portal)/portal/profile/page.tsx`
- `apps/web/src/app/(portal)/portal/reset/page.tsx`

### (public)

- `apps/web/src/app/(public)/apply/[slug]/page.tsx`
- `apps/web/src/app/(public)/board/[workspaceSlug]/apply/[jobSlug]/page.tsx`
- `apps/web/src/app/(public)/board/[workspaceSlug]/jobs/[jobSlug]/page.tsx`
- `apps/web/src/app/(public)/board/[workspaceSlug]/legal/[page]/page.tsx`
- `apps/web/src/app/(public)/board/[workspaceSlug]/page.tsx`
- `apps/web/src/app/(public)/enter/page.tsx`
- `apps/web/src/app/(public)/jobs/[slug]/page.tsx`
- `apps/web/src/app/(public)/jobs/page.tsx`
- `apps/web/src/app/(public)/legal/[page]/page.tsx`
- `apps/web/src/app/(public)/legal/page.tsx`
- `apps/web/src/app/(public)/page.tsx`
- `apps/web/src/app/(public)/setup/page.tsx`

### other

- `apps/web/src/app/admin/page.tsx`
- `apps/web/src/app/change-password/page.tsx`
- `apps/web/src/app/invite/[invitationId]/page.tsx`
- `apps/web/src/app/join/[token]/page.tsx`
- `apps/web/src/app/no-workspace/page.tsx`
- `apps/web/src/app/oauth/consent/page.tsx`
- `apps/web/src/app/setup-2fa/page.tsx`
- `apps/web/src/app/sign/[token]/page.tsx`

## Completion checklist for each surface

- Record the route, component and state reviewed. Exercise success, empty, loading, validation, error, permission and confirmation states where present.
- Extract complete messages with context. Include aria labels, titles, placeholders, alt text, toast messages, metadata, browser titles and notification text.
- Identify values, counts and grammatical variants. Use tested ICU plurals and interpolation; preserve placeholders in each translation.
- Review date, time, number and currency presentation with the selected locale and intended time zone. Keep calculations, stored values, identifiers and evidence formats stable.
- Translate English source into Spanish, Brazilian Portuguese, German, French and Dutch. Apply humanizer in every language, preserve meaning and ask a fluent reviewer to check terminology and context.
- Test long translations and keyboard/screen-reader output. Mark the language of each translated surface accurately while migration is incomplete.
- Confirm catalog keys and placeholders across languages. Verify fallback behavior for missing translations and check that no raw keys appear.

## Boundaries and open work

- Customer-authored job descriptions, email templates, candidate data and legal text need an explicit product policy; do not silently rewrite them.
- API contracts, enum values, internal prompts, log messages, identifiers and security evidence must not change merely to localize the interface. Map stable codes to localized UI messages where needed.
- A static route inventory cannot find all runtime strings, third-party widgets, data-driven labels or inaccessible states. Review source and run representative flows before marking coverage complete.
- `apps/web/src/features/reports/ReportsDashboard.tsx` and `apps/web/src/features/developers/WebhooksSection.tsx` illustrate date and number formatting that needs review. `apps/web/src/features/reports/window.ts` also contains formatters used for calculations; inspect their purpose before changing them.
- Emails need a recipient-language policy and a separate rendering and delivery review. Crowdin configuration alone does not supply that policy.
