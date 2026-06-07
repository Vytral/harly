# OpenHire Core — Idea

## What is this?

The `apps/app` package. The ATS itself. A Next.js application that any developer can
clone, configure, and run on their own infrastructure. It is both the self-hosted product
and the codebase powering the managed cloud.

## Who is it for?

Developers and technical teams who want to self-host their own hiring platform.
They are comfortable with a .env file, a Postgres database, and a deploy button.
They are not comfortable with $250/month SaaS bills.

## Problem

Self-hosting a modern ATS is currently not possible without building one from scratch
or suffering through outdated open-source options. There is no "just clone and run"
option that produces a beautiful, functional result.

## Differentiation

- Ships with seed data so you can see it working immediately after setup
- Env validation at startup — it tells you exactly what's missing before it crashes
- Designed for a single workspace per install (simpler) with optional multi-workspace
- Beautiful default UI — candidates and recruiters both get a good experience
- Every feature is optional — disable email, skip storage, use local disk; it degrades
  gracefully

## Non-goals

- Not a multi-tenant SaaS platform (that's `apps/cloud`)
- Not a job aggregator
- Not an HRIS
- Does not require Kubernetes, Redis, or a team of DevOps engineers to run

## Success criteria

- A developer can go from `npx @openhire/create` to a working ATS in under 10 minutes
- A non-developer (with a Railway account) can deploy it in under 20 minutes
- The UI passes a "would I be embarrassed to show this to a candidate?" test
- All core hiring flows work: post job → candidate applies → recruiter reviews → hire or reject
