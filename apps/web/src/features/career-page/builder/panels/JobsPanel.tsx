"use client";

import { useTranslations } from "next-intl";

import type { CareerPageConfig } from "@/features/career-page/config";

import type { ConfigUpdater, Job } from "../types";
import { capabilitiesFor, templateLabel } from "../template-capabilities";
import { TextField, ToggleRow } from "../primitives";
import { Group, PanelHeader } from "./PanelKit";

export function JobsPanel({
  config,
  update,
  jobs,
}: {
  config: CareerPageConfig;
  update: ConfigUpdater;
  jobs: Job[];
}) {
  const t = useTranslations("features.careerPage.JobsPanel");
  const tTemplates = useTranslations("labels.careerPage.templates");
  const caps = capabilitiesFor(config.template);

  return (
    <div className="space-y-4">
      <PanelHeader
        title={t("title")}
        subtitle={
          jobs.length === 0
            ? t("noPublishedJobs")
            : t("publishedJobs", { count: jobs.length })
        }
      />

      <Group title={t("openPositions")} defaultOpen errorPrefix="positions.">
        {caps.positionsTitle ? (
          <TextField
            label={t("sectionTitle")}
            path="positions.title"
            value={config.positions.title}
            max={60}
            placeholder={t("sectionTitlePlaceholder")}
            onChange={(v) => update((d) => void (d.positions.title = v))}
          />
        ) : null}

        <div className="space-y-3">
          <span className="block text-[13px] font-medium text-near-ink">{t("filters")}</span>
          {caps.filters.length === 0 ? (
            <p className="rounded-[var(--radius-btn)] bg-card-inset px-3 py-2 text-[12px] leading-snug text-soft-ink">
              {t("noFilters", { template: templateLabel(config.template, tTemplates) })}
            </p>
          ) : (
            caps.filters.map((filter) => {
              const on = config.positions.filters.includes(filter);
              return (
                <ToggleRow
                  key={filter}
                  label={t(`filterOptions.${filter}.label`)}
                  description={t(`filterOptions.${filter}.description`)}
                  checked={on}
                  onCheckedChange={(next) =>
                    update((d) => {
                      d.positions.filters = next
                        ? [...d.positions.filters.filter((x) => x !== filter), filter]
                        : d.positions.filters.filter((x) => x !== filter);
                    })
                  }
                />
              );
            })
          )}
        </div>
        {!caps.positionsTitle ? (
          <p className="text-[12px] text-quiet-mist">{t("notUsedSectionTitle", { template: templateLabel(config.template, tTemplates) })}</p>
        ) : null}
      </Group>
    </div>
  );
}
