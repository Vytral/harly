import { cn } from "@/lib/utils";
import {
  ArrowUpRightIcon,
  InfoIcon,
  LightningIcon,
  LockSimpleIcon,
} from "@/components/ui/icons/phosphor";

import { WORKFLOW_TEMPLATES, getTemplate } from "./builder/templates";
import { triggerMeta } from "./builder/catalog";

/**
 * Demo-mode Automations page. Mirrors the real AutomationsManager layout
 * (header → recipe cards → starter recipes) so the section reads like the
 * product, but everything is static: no workspace reads, no links into the
 * builder (it redirects in demo), no toggles, no mutating controls.
 */

type SampleRecipe = {
  templateId: string;
  /** Plain-language sentence for the card; the builder preview is too technical for a tour. */
  summary: string;
  lastRun: string;
};

const SAMPLE_RECIPES: SampleRecipe[] = [
  {
    templateId: "notify-slack-on-apply",
    summary:
      "When a candidate applies, post a message to the team channel with their name and the role.",
    lastRun: "12 min ago",
  },
  {
    templateId: "screening-task-on-stage",
    summary:
      "When a candidate moves to Phone screen, create a task for the recruiter to book the call.",
    lastRun: "1 hour ago",
  },
  {
    templateId: "interview-prep-task",
    summary:
      "When an interview is scheduled, create a prep task so the interviewer reviews the profile first.",
    lastRun: "yesterday",
  },
  {
    templateId: "tag-vip-candidates",
    summary:
      "When a candidate applies with a match score of 80 or more, tag them as high-fit and tell the team.",
    lastRun: "3 days ago",
  },
];

// Paused on purpose so the list shows both states, like a real workspace.
const PAUSED = new Set(["tag-vip-candidates"]);

const recipes = SAMPLE_RECIPES.flatMap((sample) => {
  const template = getTemplate(sample.templateId);
  if (!template) return [];
  const definition = template.build();
  return [
    {
      ...sample,
      name: template.name,
      trigger: triggerMeta(definition.trigger.event).label,
      actionCount: definition.actions.length,
      enabled: !PAUSED.has(sample.templateId),
    },
  ];
});

const starterRecipes = WORKFLOW_TEMPLATES.filter(
  (template) => !SAMPLE_RECIPES.some((sample) => sample.templateId === template.id),
);

export function AutomationsDemo() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-near-ink">
            Automations
          </h1>
          <p className="mt-1 text-sm text-soft-ink">
            {recipes.length} recipes · when something happens, Harly can email, tag,
            task, or move a candidate.
          </p>
        </div>
        <span className="font-chrome inline-flex items-center gap-1.5 rounded-full bg-soft-kraft px-3 py-1 text-[12px] text-soft-ink">
          <LockSimpleIcon className="size-3.5" /> View only
        </span>
      </div>

      <p
        role="note"
        className="mt-6 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl border border-hairline bg-pure-snow px-4 py-3 text-sm text-soft-ink"
      >
        <InfoIcon className="size-4 shrink-0 text-near-ink" />
        <span>
          These are sample recipes. In the demo nothing runs and editing is off.
        </span>
        <a
          href="https://docs.harly.dev/self-hosting/overview"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-near-ink underline-offset-4 hover:underline"
        >
          Self-host Harly
          <ArrowUpRightIcon className="size-3.5" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <span>to build your own.</span>
      </p>

      <section
        aria-label="Sample automations"
        className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        {recipes.map((recipe) => (
          <article
            key={recipe.templateId}
            className={cn(
              "flex flex-col rounded-2xl border bg-pure-snow p-5 shadow-xs",
              recipe.enabled ? "border-mist-border" : "border-hairline opacity-65",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
                  recipe.enabled
                    ? "bg-near-ink text-primary-foreground"
                    : "bg-soft-kraft text-soft-ink",
                )}
              >
                <LightningIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-display text-base font-semibold text-near-ink">
                  {recipe.name}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-soft-ink">
                  {recipe.summary}
                </p>
              </div>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4 pl-11">
              <span className="inline-flex items-center rounded-full bg-soft-kraft px-2.5 py-0.5 text-[11px] font-medium text-near-ink">
                {recipe.trigger}
              </span>
              <span className="inline-flex items-center rounded-full bg-soft-kraft px-2.5 py-0.5 text-[11px] font-medium text-soft-ink">
                {recipe.actionCount} {recipe.actionCount === 1 ? "action" : "actions"}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                  recipe.enabled
                    ? "bg-near-ink text-primary-foreground"
                    : "bg-soft-kraft text-soft-ink",
                )}
              >
                {recipe.enabled ? "On" : "Paused"}
              </span>
              <span className="ml-auto text-[11px] text-soft-ink">
                last run {recipe.lastRun}
              </span>
            </div>
          </article>
        ))}
      </section>

      <section
        aria-labelledby="demo-starter-recipes-title"
        className="mt-6 rounded-2xl border border-mist-border bg-pure-snow p-6 shadow-xs"
      >
        <h2
          id="demo-starter-recipes-title"
          className="font-display text-lg font-semibold text-near-ink"
        >
          Starter recipes
        </h2>
        <p className="mt-0.5 text-xs text-soft-ink">
          Every workspace ships with these. Pick one and adjust each step in the editor.
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {starterRecipes.map((template) => (
            <li
              key={template.id}
              className="flex flex-col rounded-xl border border-mist-border/80 bg-warm-paper p-4"
            >
              <span className="font-chrome text-[11px] uppercase tracking-[0.04em] text-soft-ink">
                {template.category}
              </span>
              <span className="font-display mt-1 text-sm font-semibold text-near-ink">
                {template.name}
              </span>
              <span className="mt-1 text-xs leading-relaxed text-soft-ink">
                {template.description}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
