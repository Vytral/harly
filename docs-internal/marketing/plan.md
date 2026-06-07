# OpenHire Marketing — Plan

## Current state

Does not exist. No landing page, no domain, no brand assets.

## Target state

A live site at openhire.dev with:

```
Sections:
  1. Hero — headline + subheading + CTA (self-host / cloud waitlist) + screenshot/GIF
  2. Problem — why existing ATS tools are broken for small teams
  3. Features — what OpenHire gives you (pipeline, job board, branding, self-hosted)
  4. Comparison — OpenHire vs Workable vs Greenhouse (price + features table)
  5. Quick start — 3 steps: install → configure → done
  6. Cloud — managed option for those who don't want to self-host (waitlist)
  7. Open source — MIT license, GitHub link, star count, contributors
  8. Footer — GitHub, docs, status, Twitter/X
```

## Milestones

### M1 — Before launch (Week 9)
- [ ] Register openhire.dev domain
- [ ] Design and build landing page (Next.js or Astro, deployed on Vercel)
- [ ] Write headline, subheading, and feature copy
- [ ] Take product screenshots / record demo GIF
- [ ] Deploy to Vercel with custom domain

### M2 — Launch week (Week 10)
- [ ] Cloud waitlist form (simple email capture → save to DB or Loops/Resend)
- [ ] Add "Deploy to Railway" and "Deploy to Fly.io" buttons
- [ ] Add GitHub stars widget (live count)
- [ ] SEO: meta tags, OpenGraph, sitemap, robots.txt
- [ ] Analytics: PostHog or Plausible

### M3 — Post-launch
- [ ] Changelog page (public roadmap + version history)
- [ ] Testimonials section (once we have users)
- [ ] Blog post: "Why I built OpenHire" (founder story, great for SEO)

## Technical decisions

- Framework: Next.js (keeps it in the monorepo under apps/marketing) or Astro (lighter)
- Hosting: Vercel
- Analytics: Plausible (privacy-first, simple) or PostHog
- Waitlist: simple Resend audience or Loops

## Copy direction

Headline ideas:
- "The ATS you actually want to use. Open source. Self-hosted. Free."
- "Hire better. Own your data. Pay nothing."
- "Workable costs $250/mo. OpenHire costs $0."

Tone: direct, confident, slightly irreverent. Like the founder is talking to you, not
a marketing agency.

## Open questions

- Astro vs Next.js for the marketing site? Astro is lighter and faster to build for pure
  marketing content, but adds a second framework to learn.
- Animate the hero with a live product screenshot or a recorded GIF?

## Next actions

1. Register openhire.dev (or openhire.app if .dev is taken)
2. Decide: Astro vs Next.js
3. Write the hero copy first — everything else follows from the headline
4. Build the site in one focused sprint during Week 9
