# @harly/emails

Transactional email templates and sending for Harly.

Built with [React Email](https://react.email/) + [Resend](https://resend.com/).

## What's inside

- **Templates** (`src/templates/`) — 19 React Email templates:
  - `ApplicationReceivedCandidate` / `ApplicationReceivedRecruiter`
  - `CandidateRejected` / `CandidateStageUpdate`
  - `InterviewScheduled` / `InterviewCanceled` / `InterviewRescheduled`
  - `OfferExtended` / `OfferWithdrawn`
  - `PortalMagicLink` / `ResetPassword` / `VerifyEmail` / `WelcomeEmail`
  - `WorkspaceInvitation`
  - `CustomTemplateEmail` — user-defined templates with variable interpolation
  - `calendarLinks` — ICS attachment generation
- **Sender** (`src/sender.ts`) — Resend provider with console fallback for dev.
- **Logo** (`src/logo.ts`) — Harly logo asset for email headers.
- **Inbound** (`src/inbound/`) — webhook receiver for inbound email → candidate timeline.
- **Layout** (`HarlyLayout.tsx`, `WorkspaceLayout.tsx`) — shared email layout wrappers.

## Usage

```ts
import { sendEmail } from "@harly/emails";
import { ApplicationReceivedCandidate } from "@harly/emails/templates";

await sendEmail({
  to: candidate.email,
  subject: "We received your application",
  react: <ApplicationReceivedCandidate candidateName={candidate.name} jobTitle={job.title} />,
});
```

## Configuration

Set in `.env`:

```bash
RESEND_API_KEY="re_..."
EMAIL_FROM="noreply@harly.com"
```

Authentication emails require a configured sender in production. For local
development without a provider, set `AUTH_EMAIL_CONSOLE_FALLBACK=true` to
print one-time authentication links to the terminal. Never enable this in a
shared environment because anyone with log access could use the link.
