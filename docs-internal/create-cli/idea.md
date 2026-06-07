# create-openhire — Idea

## What is this?

An npm package that lets anyone bootstrap a self-hosted OpenHire instance with a single
command:

```bash
npx @openhire/create
```

It walks the user through a short interactive wizard, generates a ready-to-run `.env`
file, and gives them exact next steps for their chosen deployment target.

## Who is it for?

Developers and technical users who want to self-host OpenHire. They know what a terminal
is. They may not know what an S3 bucket is — and that's fine, the wizard explains.

## Problem

Even good software dies if setup is painful. "Clone the repo, copy .env.example,
fill in 20 variables, run migrations, hope it works" is a bad experience. The CLI
eliminates that friction.

## Differentiation

- Guided wizard with explanations — not just prompts, but context for each answer
- Detects the environment (Railway, Fly.io, Docker, local) and adapts
- Validates credentials before writing the .env (can we reach the DB? does the R2
  bucket exist?)
- Generates a final checklist of what to do next
- `npx @openhire/create upgrade` for updating an existing install

## Non-goals

- Not a full deployment tool (doesn't SSH into servers or run docker commands for you)
- Not a GUI — terminal only
- Does not manage secrets (you still copy the .env to your host)

## Success criteria

- Median time from `npx @openhire/create` to working .env: under 3 minutes
- Zero "what does this variable mean?" support requests for wizard-covered fields
- Works on macOS, Linux, and Windows (WSL)
