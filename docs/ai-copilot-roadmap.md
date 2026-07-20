---
title: "Harly AI Copilot Roadmap"
description: "The execution plan for turning Harly AI into a context-aware recruiting copilot."
---

# Harly AI Copilot Roadmap

## Product north star

Harly AI should feel like a teammate who is already looking at the same
workspace and screen as the recruiter:

> A recruiter opens a candidate, says “What do you think?”, and Harly reviews
> the actual candidate, role, evidence, and next step without asking for an
> ID or making the recruiter repeat context.

Harly must recommend with evidence, propose consequential actions with a clear
confirmation, execute safely, and leave an auditable result.

## Delivery principles

- Context before verbosity: pass the current surface and entity explicitly.
- Evidence before confidence: recommendations cite the candidate's actual
  resume, application, score, interviews, and notes.
- Propose, confirm, execute: never silently move, reject, email, schedule, or
  change a record.
- Backend-enforced safety: prompts guide the model; permissions, workspace
  scoping, schemas, idempotency, and transactions enforce reality.
- Recoverable by default: integrations can fail without losing the local ATS
  record, and users get a retry path.
- Measure every important flow with deterministic tests and live workspace
  smoke tests.

## Phase 1 — Context-aware copilot

### Goal

When the user opens a candidate profile and asks “what do you think?”, Harly
knows which candidate is on screen.

### Scope

- Infer the active candidate from the current dashboard route.
- Send the active candidate context with every chat request.
- Tell the agent that “this candidate”, “este candidato”, and similar phrases
  refer to the active record.
- Allow `candidateProfile` to use the active candidate when no ID is supplied.
- Resolve the immediate next pipeline stage with a dedicated contextual read
  before proposing a move.
- Review the candidate before answering an opinion request.
- Generate an AI evaluation when one does not exist, then explain the evidence.
- Treat “pass them” as a consequential pipeline action: resolve the role and
  destination stage, show the confirmation card, and never move silently.
- Reset the chat when the user navigates to a different candidate, preventing
  context leakage between profiles.

### Acceptance tests

- On `/dashboard/candidates/<candidateId>`, “What do you think?” calls the
  candidate profile flow and returns a grounded recommendation.
- “Review this CV” does not ask the user to identify the candidate again.
- “Pass them” proposes a move with the correct candidate/application and stage.
- Terminal applications such as `Hired` and `Rejected` never receive a bogus
  next-stage proposal, even if the pipeline ordering places another terminal
  stage after them.
- A cancelled confirmation causes no database write.
- Navigating from candidate A to candidate B starts a fresh scoped conversation.
- Candidate-supplied prompt injection is treated as data, not instructions.

## Phase 2 — Reliable actions

- Add dry-run previews for multi-step actions.
- Add idempotency keys to emails, interviews, calendar events, and batch moves.
  **Done for email outbox and Google Calendar interviews; provider event IDs
  are deterministic so timeout retries do not create duplicate invitations.**
- Add “undo last action” where the underlying operation is reversible. **Done
  for pipeline stage moves, task creation, and interview scheduling; exposed
  in Harly with confirmation and optimistic-concurrency guards.**
- Add batch confirmation with a complete affected-record summary.
- Store an action receipt: actor, tool, inputs, result, timestamp, and related
  entity. **Done with actor scoping, replay protection, compact history, and
  safe receipt selection.**
- Make partial failures explicit: report what succeeded and what needs retry.
  **Done for interview scheduling/cancellation: provider failures return an
  actionable warning and are persisted in the sync ledger.**

## Phase 3 — Recruiting intelligence

- Compare candidates against a job's requirements and evidence.
- Detect missing feedback, stalled candidates, duplicate profiles, and weak
  funnel stages.
- Prepare daily interview briefs and post-interview summaries.
- Generate follow-up queues and drafts without sending automatically.
- Explain every recommendation with strengths, gaps, confidence, and unknowns.

## Phase 4 — Proactive copilot

- Daily hiring brief for recruiters and hiring managers.
- Alerts for overdue follow-ups, interviews without feedback, expiring offers,
  stalled candidates, and jobs without qualified applicants.
- Suggested next actions directly from dashboard cards.
- Scheduled reports with workspace-level permissions and audit history.

## Phase 5 — Integrations and recovery

- Normalize integration state: `connected`, `needs_reconnect`, `degraded`, and
  `not_connected`.
- Add per-object sync status and a “retry sync” action.
- Prevent duplicate calendar events with provider event IDs and idempotency.
- Add retry/backoff for transient provider failures.
- Keep Google Calendar/Meet, Zoom, Outlook/Teams, email, and Slack behind
  provider-neutral capabilities.

## Phase 6 — Memory and personalization

- Store user preferences for tone, timezone, and working style.
- Store workspace recruiting guidelines and role-specific criteria.
- Let admins review, edit, export, and delete AI memory.
- Never treat candidate content as memory or executable instruction.

## Evaluation scorecard

Track these metrics for every release:

- correct entity resolution;
- correct tool selection;
- groundedness and evidence coverage;
- write confirmation accuracy;
- duplicate/partial-write rate;
- workspace isolation failures;
- prompt-injection resistance;
- integration recovery rate;
- latency, tokens, and cost per workflow.

The live test suite should cover real workspace reads, a controlled set of
authorized writes, integration failures, ambiguous applications, missing
records, and candidate-content injection.

## Current implementation status

- Phase 1 context plumbing, next-stage safety, durable write receipts, action
  audit metadata, safe undo for stages/tasks/interviews, and Harly-visible action history:
  implemented and smoke-tested against the local workspace. Continue with
  browser-level UX polish and the remaining reversible actions.
- Candidate read/review, scoring, drafting, reports, and confirmed writes:
  available and covered by unit/live smoke tests.
- Google Calendar/Meet OAuth and invalid-token recovery: available; revoked
  tokens are cleared and both integration panels immediately expose reconnect.
- Interview sync ledger: implemented for scheduled/canceled provider
  mutations with `pending`, `synced`, `failed`, and `canceled` states,
  exponential retry timestamps, and workspace-scoped records. Manual retry is
  now available from the candidate interview card, and the scheduler consumes
  due rows automatically with row-level claiming and stale-lock recovery.
- Proactive briefings, memory, and undo adapters for more action types: planned.
