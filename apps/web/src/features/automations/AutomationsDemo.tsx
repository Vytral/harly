import Link from "next/link";

const examples = [
  {
    number: "01",
    title: "A new candidate applies",
    trigger: "When an application arrives",
    steps: ["Check the role and application details", "Add a review task for the hiring team"],
    outcome: "A task would be prepared for review.",
  },
  {
    number: "02",
    title: "An interview is completed",
    trigger: "When an interview is marked complete",
    steps: ["Check whether feedback is still missing", "Remind the interview team"],
    outcome: "A reminder would be prepared for the team.",
  },
  {
    number: "03",
    title: "A candidate reaches a decision stage",
    trigger: "When a candidate enters a stage",
    steps: ["Check the stage and candidate status", "Prepare the next follow-up task"],
    outcome: "A follow-up task would be prepared for review.",
  },
];

export function AutomationsDemo() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-soft-ink">
          Guided demo · examples only
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-near-ink">
          Automations
        </h1>
        <p className="mt-3 text-base leading-7 text-soft-ink">
          Automations connect hiring events to helpful follow-up steps. Explore these
          sample recipes to see the shape of a workflow.
        </p>
      </div>

      <section
        aria-labelledby="demo-safety-title"
        className="mt-7 rounded-2xl border border-mist-border bg-soft-kraft/50 p-5 sm:p-6"
      >
        <h2 id="demo-safety-title" className="font-semibold text-near-ink">
          Safe simulation, no workflow execution
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-soft-ink">
          These examples are fixed and display-only. Nothing is created, published,
          scheduled, or sent to candidates or external services. A simulation previews
          what steps might happen; execution runs a saved workflow against live data.
          This demo only explains the idea and does not run either one.
        </p>
      </section>

      <section aria-label="Example automation recipes" className="mt-7 grid gap-4 md:grid-cols-3">
        {examples.map((example) => (
          <article
            key={example.number}
            className="flex flex-col rounded-2xl border border-mist-border bg-pure-snow p-5"
          >
            <p className="text-xs font-semibold tracking-wide text-soft-ink">
              EXAMPLE {example.number}
            </p>
            <h2 className="mt-3 text-lg font-semibold leading-6 text-near-ink">
              {example.title}
            </h2>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-soft-ink">
              Starts when
            </p>
            <p className="mt-1 text-sm text-near-ink">{example.trigger}</p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-soft-ink">
              Example steps
            </p>
            <ol className="mt-2 list-inside list-decimal space-y-2 text-sm leading-5 text-near-ink">
              {example.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <p className="mt-auto border-t border-mist-border pt-4 text-sm leading-5 text-soft-ink">
              <span className="font-medium text-near-ink">Illustrative result: </span>
              {example.outcome}
            </p>
          </article>
        ))}
      </section>

      <aside className="mt-8 rounded-2xl bg-near-ink p-6 text-primary-foreground sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <h2 className="text-lg font-semibold">Ready to build real automations?</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-primary-foreground/75">
            Run Harly in your own self-hosted workspace to create, configure, simulate,
            and publish workflows for your team.
          </p>
        </div>
        <Link
          href="https://docs.harly.dev/self-hosting/overview"
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex shrink-0 items-center justify-center rounded-full bg-pure-snow px-5 py-2.5 text-sm font-medium text-near-ink transition-colors hover:bg-soft-kraft sm:mt-0"
        >
          Self-host Harly <span className="sr-only"> (opens in a new tab)</span>
        </Link>
      </aside>
    </main>
  );
}
