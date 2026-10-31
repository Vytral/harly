"use client";

import type { CareerPageConfig } from "@/features/career-page/config";

import type { ConfigUpdater, Job } from "../types";
import { capabilitiesFor, type JobFilter } from "../template-capabilities";
import { TextField, ToggleRow } from "../primitives";
import { Group, PanelHeader } from "./PanelKit";

const FILTER_LABEL: Record<JobFilter, { label: string; description: string }> = {
  department: { label: "Department", description: "Engineering, Design, Sales…" },
  location: { label: "Location", description: "City or remote" },
  type: { label: "Employment type", description: "Full-time, contract…" },
};

export function JobsPanel({
  config,
  update,
  jobs,
}: {
  config: CareerPageConfig;
  update: ConfigUpdater;
  jobs: Job[];
}) {
  const caps = capabilitiesFor(config.template);

  return (
    <div className="space-y-4">
      <PanelHeader
        title="Jobs"
        subtitle={
          jobs.length === 0
            ? "No published jobs yet. The list fills in as soon as you publish one."
            : `${jobs.length} published ${jobs.length === 1 ? "job" : "jobs"} appear on the page.`
        }
      />

      <Group title="Open positions" defaultOpen errorPrefix="positions.">
        {caps.positionsTitle ? (
          <TextField
            label="Section title"
            path="positions.title"
            value={config.positions.title}
            max={60}
            placeholder="Open positions"
            onChange={(v) => update((d) => void (d.positions.title = v))}
          />
        ) : null}

        <div className="space-y-3">
          <span className="block text-[13px] font-medium text-near-ink">Filters</span>
          {caps.filters.length === 0 ? (
            <p className="rounded-[var(--radius-btn)] bg-card-inset px-3 py-2 text-[12px] leading-snug text-soft-ink">
              {caps.label} lists jobs grouped by department, without filters. Pick Ashby, Join or
              Showcase for a filterable list.
            </p>
          ) : (
            caps.filters.map((filter) => {
              const on = config.positions.filters.includes(filter);
              return (
                <ToggleRow
                  key={filter}
                  label={FILTER_LABEL[filter].label}
                  description={FILTER_LABEL[filter].description}
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
          <p className="text-[12px] text-quiet-mist">Not used by {caps.label}: section title.</p>
        ) : null}
      </Group>
    </div>
  );
}
