import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import {
  ArrowUpRightIcon,
  InfoIcon,
  LightningIcon,
  LockSimpleIcon,
} from "@/components/ui/icons/phosphor";

import { WORKFLOW_TEMPLATES, getTemplate, templateCopy } from "./builder/templates";
import { triggerMeta, type BuilderT } from "./builder/catalog";

/**
 * Demo-mode Automations page. Mirrors the real AutomationsManager layout
 * (header → recipe cards → starter recipes) so the section reads like the
 * product, but everything is static: no workspace reads, no links into the
 * builder (it redirects in demo), no toggles, no mutating controls.
 */

type SampleRecipe = {
  templateId: string;
  /** Key under sampleSummaries; the builder preview is too technical for a tour. */
  summaryKey: "applyToSlack" | "phoneScreenTask" | "interviewPrepTask" | "tagVip";
  lastRun: "minutesAgo" | "hourAgo" | "yesterday" | "daysAgo";
};

const SAMPLE_RECIPES: SampleRecipe[] = [
  {
    templateId: "notify-slack-on-apply",
    summaryKey: "applyToSlack",
    lastRun: "minutesAgo",
  },
  {
    templateId: "screening-task-on-stage",
    summaryKey: "phoneScreenTask",
    lastRun: "hourAgo",
  },
  {
    templateId: "interview-prep-task",
    summaryKey: "interviewPrepTask",
    lastRun: "yesterday",
  },
  {
    templateId: "tag-vip-candidates",
    summaryKey: "tagVip",
    lastRun: "daysAgo",
  },
];

// Paused on purpose so the list shows both states, like a real workspace.
const PAUSED = new Set(["tag-vip-candidates"]);

function buildRecipes(tl: BuilderT) {
  return SAMPLE_RECIPES.flatMap((sample) => {
    const template = getTemplate(sample.templateId);
    if (!template) return [];
    const definition = template.build();
    return [
      {
        ...sample,
        name: templateCopy(template, tl).name,
        trigger: triggerMeta(definition.trigger.event, tl).label,
        actionCount: definition.actions.length,
        enabled: !PAUSED.has(sample.templateId),
      },
    ];
  });
}

const starterRecipes = WORKFLOW_TEMPLATES.filter(
  (template) => !SAMPLE_RECIPES.some((sample) => sample.templateId === template.id),
);

export async function AutomationsDemo() {
  const t = await getTranslations("features.automations.AutomationsDemo");
  const tl = await getTranslations("labels.automations");
  const recipes = buildRecipes(tl);
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-near-ink">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-soft-ink">
            {t("recipesSummary", { count: recipes.length })}
          </p>
        </div>
        <span className="font-chrome inline-flex items-center gap-1.5 rounded-full bg-soft-kraft px-3 py-1 text-[12px] text-soft-ink">
          <LockSimpleIcon className="size-3.5" /> {t("viewOnly")}
        </span>
      </div>

      <p
        role="note"
        className="mt-6 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl border border-hairline bg-pure-snow px-4 py-3 text-sm text-soft-ink"
      >
        <InfoIcon className="size-4 shrink-0 text-near-ink" />
        <span>
          {t.rich("selfHostNote", {
            link: (chunks) => (
              <a
                href="https://docs.harly.dev/self-hosting/overview"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-near-ink underline-offset-4 hover:underline"
              >
                {chunks}
                <ArrowUpRightIcon className="size-3.5" />
                <span className="sr-only"> {t("opensInNewTab")}</span>
              </a>
            ),
          })}
        </span>
      </p>

      <section
        aria-label={t("sampleAutomations")}
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
                  {t(`sampleSummaries.${recipe.summaryKey}`)}
                </p>
              </div>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4 pl-11">
              <span className="inline-flex items-center rounded-full bg-soft-kraft px-2.5 py-0.5 text-[11px] font-medium text-near-ink">
                {recipe.trigger}
              </span>
              <span className="inline-flex items-center rounded-full bg-soft-kraft px-2.5 py-0.5 text-[11px] font-medium text-soft-ink">
                {t("actionCount", { count: recipe.actionCount })}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                  recipe.enabled
                    ? "bg-near-ink text-primary-foreground"
                    : "bg-soft-kraft text-soft-ink",
                )}
              >
                {recipe.enabled ? t("on") : t("paused")}
              </span>
              <span className="ml-auto text-[11px] text-soft-ink">
                {t("lastRun", { when: t(`lastRunAt.${recipe.lastRun}`) })}
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
          {t("starterRecipes")}
        </h2>
        <p className="mt-0.5 text-xs text-soft-ink">
          {t("starterRecipesHint")}
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {starterRecipes.map((template) => {
            const copy = templateCopy(template, tl);
            return (
            <li
              key={template.id}
              className="flex flex-col rounded-xl border border-mist-border/80 bg-warm-paper p-4"
            >
              <span className="font-chrome text-[11px] uppercase tracking-[0.04em] text-soft-ink">
                {copy.category}
              </span>
              <span className="font-display mt-1 text-sm font-semibold text-near-ink">
                {copy.name}
              </span>
              <span className="mt-1 text-xs leading-relaxed text-soft-ink">
                {copy.description}
              </span>
            </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
