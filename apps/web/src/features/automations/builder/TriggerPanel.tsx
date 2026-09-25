"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Trigger } from "../schema";
import { patchTriggerFilter, WORKFLOW_EVENTS } from "../schema";
import { triggerMeta } from "./catalog";
import { BuilderSelect } from "./inspector/BuilderSelect";
import { builderFieldClass } from "./field-styles";
import {
  ArrowLineRightIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  UserCircleIcon,
  UserPlusIcon,
} from "@/components/ui/icons/phosphor";

/**
 * The WHEN panel: Human event selection with contextual quick-scopes
 * (job filter and stage selector) without requiring technical jargon.
 */
export function TriggerPanel({
  value,
  onChange,
  chosen = true,
  stageNames = [],
  stages = [],
  jobs = [],
}: {
  value: Trigger;
  onChange: (t: Trigger) => void;
  chosen?: boolean;
  stageNames?: string[];
  stages?: { id: string; name: string; jobId: string }[];
  jobs?: { id: string; title: string }[];
}) {
  const [pickerOpen, setPickerOpen] = useState(!chosen);
  const meta = triggerMeta(value.event);

  const filter = value.filter ?? {};
  const selectedJobId = typeof filter.jobId === "string" ? filter.jobId : "";
  const selectedStageId = typeof filter.toStageId === "string" ? filter.toStageId : "";
  const selectedStageName =
    typeof filter.toStageName === "string" ? filter.toStageName : "";
  const jobStages = selectedJobId
    ? stages.filter((stage) => stage.jobId === selectedJobId)
    : [];
  const uniqueNames = Array.from(
    new Set(
      (jobStages.length > 0 ? jobStages.map((s) => s.name) : stageNames).filter(Boolean),
    ),
  );
  const stageOptions =
    jobStages.length > 0
      ? jobStages
      : uniqueNames.map((name) => ({ id: name, name, jobId: "" }));
  const selectedStageValue =
    jobStages.length > 0 ? selectedStageId : selectedStageName;

  const showStage = chosen && value.event === "application.stage_changed";
  const showJob = chosen && jobs.length > 0;

  return (
    <div className="space-y-4">
      {chosen && (
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className={cn(
            "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all duration-150 ease-out",
            pickerOpen
              ? "border-foreground/30 bg-pure-snow shadow-sm ring-1 ring-foreground/20"
              : "border-mist-border bg-warm-paper hover:border-foreground/20 hover:bg-pure-snow",
          )}
        >
          <span className="flex items-center gap-3">
            <ToneIcon tone={meta.tone} active />
            <span>
              <span className="block text-sm font-semibold text-foreground">{meta.label}</span>
              <span className="block text-xs text-soft-ink">{meta.blurb}</span>
            </span>
          </span>
          <span className="rounded-full bg-soft-kraft px-2.5 py-1 text-xs font-medium text-foreground">
            {pickerOpen ? "Close" : "Change"}
          </span>
        </button>
      )}

      {(!chosen || pickerOpen) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {WORKFLOW_EVENTS.map((event) => {
            const m = triggerMeta(event);
            const active = chosen && value.event === event;
            return (
              <button
                key={event}
                type="button"
                onClick={() => {
                  onChange({ event, filter: event === value.event ? value.filter : undefined });
                  setPickerOpen(false);
                }}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all duration-150 ease-out",
                  active
                    ? "border-foreground/30 bg-warm-paper font-medium shadow-sm"
                    : "border-mist-border bg-pure-snow hover:border-foreground/20 hover:bg-soft-kraft/40",
                )}
              >
                <ToneIcon tone={m.tone} active={active} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{m.label}</span>
                  <span className="block truncate text-xs text-soft-ink">{m.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {(showJob || showStage) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {showJob && (
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Only this job <span className="font-normal text-soft-ink">(optional)</span>
              </label>
              <BuilderSelect
                value={selectedJobId}
                onChange={(e) => {
                  onChange({
                    ...value,
                    filter: patchTriggerFilter(value.filter, {
                      jobId: e.target.value,
                      toStageId: "",
                      toStageName: "",
                    }),
                  });
                }}
                aria-label="Only this job"
                className={builderFieldClass()}
              >
                <option value="">Any job</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </BuilderSelect>
            </div>
          )}

          {showStage && (
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                When they reach
              </label>
              <BuilderSelect
                value={selectedStageValue}
                onChange={(e) => {
                  const stage = stageOptions.find((item) => item.id === e.target.value);
                  onChange({
                    ...value,
                    filter: patchTriggerFilter(value.filter, {
                      toStageId: stage && stage.jobId ? stage.id : "",
                      toStageName: stage?.name ?? "",
                      stageName: "",
                    }),
                  });
                }}
                aria-label="When they reach"
                className={builderFieldClass()}
              >
                <option value="">Any stage</option>
                {stageOptions.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </BuilderSelect>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToneIcon({
  tone,
  active,
}: {
  tone: "apply" | "stage" | "outcome" | "candidate" | "interview" | "job";
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ease-out",
        active ? "bg-foreground text-background shadow-xs" : "bg-soft-kraft text-soft-ink",
      )}
    >
      <ToneGlyph tone={tone} />
    </span>
  );
}

function ToneGlyph({
  tone,
}: {
  tone: "apply" | "stage" | "outcome" | "candidate" | "interview" | "job";
}) {
  const className = "size-4";
  switch (tone) {
    case "apply":
      return <UserPlusIcon className={className} />;
    case "stage":
      return <ArrowLineRightIcon className={className} />;
    case "outcome":
      return <CheckCircleIcon className={className} />;
    case "candidate":
      return <UserCircleIcon className={className} />;
    case "interview":
      return <CalendarIcon className={className} />;
    case "job":
      return <BriefcaseIcon className={className} />;
  }
}
