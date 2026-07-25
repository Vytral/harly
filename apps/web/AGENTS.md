<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Also, if you're going to change database, create migrations, schemas, etc. you MUST read ../../packages/db/AGENTS.md in order to keep DB healthy and prevent db drifts and errors.

## UI / design system

Any UI work (components, pages, tokens, colors, spacing, icons, nav) MUST follow `../../DESIGN.md` — the source of truth for Harly's visual and product identity. If implementation conflicts with that file, the file wins: fix the code, don't "almost" match it. Read it before touching any frontend surface, and check the Pass/Fail PR gate checklist at the bottom before considering UI work done.
