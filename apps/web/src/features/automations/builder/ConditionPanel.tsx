"use client";

import { useCallback, useId } from "react";
import { Plus, RefreshCw, X } from "lucide-react";
import type { ConditionNode, FieldRef, LeafCondition, Operator } from "../schema";
import { FIELD_KIND_CATALOG, fieldKindMeta, operatorMeta, RECRUITER_OPERATORS } from "./catalog";
import { BuilderSelect } from "./inspector/BuilderSelect";
import { builderFieldClass } from "./field-styles";

/**
 * The IF panel: Recruiter-friendly condition builder.
 * Supports quick-presets for Job, Stage, Tag, AI score, and Candidate source,
 * while remaining 100% compatible with the recursive ConditionNode AST schema.
 */
export function ConditionPanel({
  value,
  onChange,
  stageNames = [],
  jobs = [],
  tags = [],
}: {
  value: ConditionNode[];
  onChange: (nodes: ConditionNode[]) => void;
  stageNames?: string[];
  jobs?: { id: string; title: string }[];
  tags?: string[];
}) {
  const update = useCallback(
    (index: number, node: ConditionNode) => {
      const next = value.slice();
      next[index] = node;
      onChange(next);
    },
    [value, onChange],
  );

  const remove = useCallback(
    (index: number) => onChange(value.filter((_, i) => i !== index)),
    [value, onChange],
  );

  const addRoot = useCallback(
    () =>
      onChange([
        ...value,
        {
          type: "leaf",
          field: { kind: "candidate", path: "source" },
          op: "eq",
          value: "",
        },
      ]),
    [value, onChange],
  );

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <EmptyConditions onAdd={addRoot} />
      ) : (
        <TreeList>
          {value.map((node, i) => (
            <NodeEditor
              key={i}
              node={node}
              onChange={(n) => update(i, n)}
              onRemove={() => remove(i)}
              depth={0}
              joiner={i < value.length - 1 ? "and" : undefined}
              stageNames={stageNames}
              jobs={jobs}
              tags={tags}
            />
          ))}
        </TreeList>
      )}

      {value.length > 0 && (
        <button
          type="button"
          onClick={addRoot}
          className="w-full rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-soft-ink transition-colors duration-150 ease-out hover:border-foreground/30 hover:bg-soft-kraft/40 hover:text-foreground"
        >
          <Plus className="mr-1 inline size-3.5" aria-hidden />
          Add another filter condition
        </button>
      )}
    </div>
  );
}

function EmptyConditions({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-warm-paper px-4 py-5 text-center">
      <p className="text-sm font-semibold text-foreground">
        No conditions — runs for every candidate
      </p>
      <p className="mt-1 text-xs text-soft-ink">
        Add filters to only run when specific criteria match (e.g. source, job, AI score, tag).
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 inline-flex items-center gap-1 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
      >
        <Plus className="size-3.5" aria-hidden />
        Add condition
      </button>
    </div>
  );
}

function Joiner({ word }: { word: "and" | "or" }) {
  return (
    <div className="relative flex h-6 items-center pl-[15px]" aria-hidden>
      <span className="font-chrome rounded-full bg-soft-kraft px-2 py-0.5 text-[11px] uppercase tracking-wider text-soft-ink">
        {word}
      </span>
    </div>
  );
}

function TreeList({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative space-y-0 border-l border-dashed border-border/80 pl-4">
      {children}
    </div>
  );
}

function NodeEditor({
  node,
  onChange,
  onRemove,
  depth,
  joiner,
  stageNames,
  jobs,
  tags,
}: {
  node: ConditionNode;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
  depth: number;
  joiner?: "and" | "or";
  stageNames: string[];
  jobs: { id: string; title: string }[];
  tags: string[];
}) {
  return (
    <div className="relative">
      <div
        className="absolute -left-4 top-4 h-px w-4 border-t border-dashed border-border"
        aria-hidden
      />
      {node.type === "leaf" ? (
        <LeafEditor
          node={node}
          onChange={onChange}
          onRemove={onRemove}
          stageNames={stageNames}
          jobs={jobs}
          tags={tags}
        />
      ) : (
        <GroupEditor
          node={node}
          onChange={onChange}
          onRemove={onRemove}
          depth={depth}
          stageNames={stageNames}
          jobs={jobs}
          tags={tags}
        />
      )}
      {joiner && <Joiner word={joiner} />}
    </div>
  );
}

function GroupEditor({
  node,
  onChange,
  onRemove,
  depth,
  stageNames,
  jobs,
  tags,
}: {
  node: Extract<ConditionNode, { type: "and" | "or" | "not" }>;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
  depth: number;
  stageNames: string[];
  jobs: { id: string; title: string }[];
  tags: string[];
}) {
  return (
    <div className="rounded-xl border border-border bg-warm-paper p-3 shadow-xs">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="font-chrome rounded-full bg-soft-kraft px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-foreground">
          {node.type === "and" ? "All of these" : node.type === "or" ? "Any of these" : "Exclude"}
        </span>
        <div className="flex items-center gap-1">
          {(node.type === "and" || node.type === "or") && (
            <>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...node,
                    children: [
                      ...node.children,
                      {
                        type: "leaf",
                        field: { kind: "candidate", path: "source" },
                        op: "eq",
                        value: "",
                      },
                    ],
                  })
                }
                className="rounded-md px-2 py-1 text-xs font-medium text-foreground hover:bg-soft-kraft"
              >
                <Plus className="mr-1 inline size-3.5" aria-hidden />
                add
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...node,
                    type: node.type === "and" ? "or" : "and",
                  })
                }
                className="rounded-md px-2 py-1 text-xs text-soft-ink hover:bg-soft-kraft hover:text-foreground"
                title="Switch AND / OR"
              >
                <RefreshCw className="mr-1 inline size-3.5" aria-hidden />
                Switch
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-xs text-soft-ink hover:text-danger-rust"
            aria-label="Remove group"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {node.type === "not" ? (
        <TreeList>
          <NodeEditor
            node={node.child}
            onChange={(child) => onChange({ ...node, child })}
            onRemove={onRemove}
            depth={depth + 1}
            stageNames={stageNames}
            jobs={jobs}
            tags={tags}
          />
        </TreeList>
      ) : node.children.length === 0 ? (
        <p className="px-2 py-1 text-xs italic text-soft-ink">
          {node.type === "and" ? "Always matches" : "Never matches"}
        </p>
      ) : (
        <TreeList>
          {node.children.map((child, i) => (
            <NodeEditor
              key={i}
              node={child}
              onChange={(n) => {
                const children = node.children.slice();
                children[i] = n;
                onChange({ ...node, children });
              }}
              onRemove={() => {
                const children = node.children.filter((_, j) => j !== i);
                onChange({ ...node, children });
              }}
              depth={depth + 1}
              joiner={
                i < node.children.length - 1
                  ? node.type === "and"
                    ? "and"
                    : "or"
                  : undefined
              }
              stageNames={stageNames}
              jobs={jobs}
              tags={tags}
            />
          ))}
        </TreeList>
      )}
    </div>
  );
}

// Preset definitions for recruiters
type PresetKey =
  | "job"
  | "source"
  | "stage"
  | "tag"
  | "ai_score"
  | "location"
  | "custom";

function getPresetKey(field: FieldRef): PresetKey {
  if (field.kind === "job" && (field.path === "id" || field.path === "title")) return "job";
  if (field.kind === "candidate" && field.path === "source") return "source";
  if (field.kind === "application" && (field.path === "stage" || field.path === "stageId")) return "stage";
  if (field.kind === "candidate" && field.path === "tags") return "tag";
  if (field.kind === "ai" && field.path === "score") return "ai_score";
  if (field.kind === "candidate" && field.path === "location") return "location";
  return "custom";
}

function LeafEditor({
  node,
  onChange,
  onRemove,
  stageNames,
  jobs,
  tags,
}: {
  node: Extract<ConditionNode, { type: "leaf" }>;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
  stageNames: string[];
  jobs: { id: string; title: string }[];
  tags: string[];
}) {
  const preset = getPresetKey(node.field);

  function setPreset(p: PresetKey) {
    switch (p) {
      case "job":
        onChange({
          type: "leaf",
          field: { kind: "job", path: "title" },
          op: "eq",
          value: jobs[0]?.title ?? "",
        });
        break;
      case "source":
        onChange({
          type: "leaf",
          field: { kind: "candidate", path: "source" },
          op: "eq",
          value: "LinkedIn",
        });
        break;
      case "stage":
        onChange({
          type: "leaf",
          field: { kind: "application", path: "stage" },
          op: "eq",
          value: stageNames[0] ?? "",
        });
        break;
      case "tag":
        onChange({
          type: "leaf",
          field: { kind: "candidate", path: "tags" },
          op: "includes",
          value: tags[0] ?? "",
        });
        break;
      case "ai_score":
        onChange({
          type: "leaf",
          field: { kind: "ai", path: "score" },
          op: "gte",
          value: 75,
        });
        break;
      case "location":
        onChange({
          type: "leaf",
          field: { kind: "candidate", path: "location" },
          op: "contains",
          value: "",
        });
        break;
      case "custom":
        onChange({
          type: "leaf",
          field: { kind: "candidate", path: "firstName" },
          op: "eq",
          value: "",
        });
        break;
    }
  }

  function setOp(op: Operator) {
    let value: LeafCondition["value"] = node.value;
    if (op === "is_set" || op === "is_empty") value = null;
    else if (operatorMeta(op).valueKind === "number" && typeof value !== "number") value = 0;
    else if (operatorMeta(op).valueKind === "list" && !Array.isArray(value)) value = [];
    onChange({ ...node, op, value });
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-pure-snow p-3.5 shadow-2xs">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-chrome text-[10px] font-semibold uppercase tracking-wider text-soft-ink">
            Field
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-soft-ink hover:text-danger-rust transition-colors"
            aria-label="Remove condition"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>

        <BuilderSelect
          value={preset}
          onChange={(e) => setPreset(e.target.value as PresetKey)}
          aria-label="Condition field"
          className={builderFieldClass({ className: "w-full font-medium" })}
        >
          <option value="source">Candidate source</option>
          <option value="job">Job applied for</option>
          <option value="stage">Current stage</option>
          <option value="tag">Candidate tag</option>
          <option value="ai_score">AI match score</option>
          <option value="location">Location</option>
          <option value="custom">Custom field…</option>
        </BuilderSelect>

        <span className="font-chrome text-[10px] font-semibold uppercase tracking-wider text-soft-ink">
          Operator
        </span>
        <BuilderSelect
          value={node.op}
          onChange={(e) => setOp(e.target.value as Operator)}
          aria-label="Condition operator"
          className={builderFieldClass({ className: "w-full" })}
        >
          {RECRUITER_OPERATORS.map((op) => (
            <option key={op} value={op}>
              {operatorMeta(op).label}
            </option>
          ))}
        </BuilderSelect>

        {node.op !== "is_set" && node.op !== "is_empty" && (
          <>
            <span className="font-chrome text-[10px] font-semibold uppercase tracking-wider text-soft-ink">
              Value
            </span>
            <div className="min-w-0 w-full">
              <SmartValueInput
                preset={preset}
                op={node.op}
                value={node.value}
                onChange={(v) => onChange({ ...node, value: v })}
                stageNames={stageNames}
                jobs={jobs}
                tags={tags}
              />
            </div>
          </>
        )}
      </div>

      {/* Fallback Custom Field Details (only if 'custom' is selected) */}
      {preset === "custom" && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-hairline-c pt-2 text-xs">
          <span className="text-soft-ink">Field:</span>
          <BuilderSelect
            value={node.field.kind}
            onChange={(e) => {
              const kind = e.target.value as FieldRef["kind"];
              if (kind === "literal") {
                onChange({ ...node, field: { kind, value: "" } as FieldRef });
              } else {
                onChange({
                  ...node,
                  field: { kind, path: fieldKindMeta(kind).paths[0] ?? "" } as FieldRef,
                });
              }
            }}
            aria-label="Custom field source"
            className="h-7 rounded border border-border bg-pure-snow px-2 text-xs text-foreground"
          >
            {FIELD_KIND_CATALOG.map((f) => (
              <option key={f.kind} value={f.kind}>
                {f.label}
              </option>
            ))}
          </BuilderSelect>
          {node.field.kind !== "literal" && (
            <input
              value={(node.field as { path: string }).path}
              onChange={(e) =>
                onChange({
                  ...node,
                  field: { ...node.field, path: e.target.value } as FieldRef,
                })
              }
              placeholder="property (e.g. headline)"
              className="h-7 flex-1 rounded border border-border bg-pure-snow px-2 text-xs text-foreground"
            />
          )}
        </div>
      )}
    </div>
  );
}

function SmartValueInput({
  preset,
  op,
  value,
  onChange,
  stageNames,
  jobs,
  tags,
}: {
  preset: PresetKey;
  op: Operator;
  value: unknown;
  onChange: (v: string | number | boolean | null | Array<string | number | boolean>) => void;
  stageNames: string[];
  jobs: { id: string; title: string }[];
  tags: string[];
}) {
  const uniqueId = useId().replace(/:/g, "");
  const meta = operatorMeta(op);
  if (!meta.wantsValue) {
    return (
      <div className="flex h-9 items-center px-2 text-xs italic text-soft-ink">
        No value required
      </div>
    );
  }

  // Job picker preset
  if (preset === "job" && jobs.length > 0) {
    return (
      <BuilderSelect
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Job condition value"
        className={builderFieldClass()}
      >
        <option value="">Select a job…</option>
        {jobs.map((j) => (
          <option key={j.id} value={j.title}>
            {j.title}
          </option>
        ))}
      </BuilderSelect>
    );
  }

  // Stage picker preset
  if (preset === "stage" && stageNames.length > 0) {
    return (
      <BuilderSelect
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Stage condition value"
        className={builderFieldClass()}
      >
        <option value="">Select a stage…</option>
        {stageNames.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </BuilderSelect>
    );
  }

  // Tag picker preset
  if (preset === "tag") {
    const listId = `preset-tags-${uniqueId}`;
    return (
      <div className="relative">
        <input
          list={listId}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tag label (e.g. vip)"
          aria-label="Candidate tag"
          className={builderFieldClass()}
        />
        <datalist id={listId}>
          {tags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
    );
  }

  // Candidate source quick suggestions
  if (preset === "source") {
    const listId = `preset-sources-${uniqueId}`;
    return (
      <div className="relative">
        <input
          list={listId}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Source (e.g. LinkedIn, Referral)"
          aria-label="Candidate source"
          className={builderFieldClass()}
        />
        <datalist id={listId}>
          {["LinkedIn", "Referral", "Indeed", "Career page", "Inbound", "Agency"].map(
            (s) => (
              <option key={s} value={s} />
            ),
          )}
        </datalist>
      </div>
    );
  }

  // Number input for AI score or numbers
  if (preset === "ai_score" || meta.valueKind === "number") {
    return (
      <input
        type="number"
        value={typeof value === "number" ? value : Number(value) || 0}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder="Score (0-100)"
        className={builderFieldClass()}
      />
    );
  }

  // List input
  if (meta.valueKind === "list") {
    return (
      <input
        value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
        onChange={(e) =>
          onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
        }
        placeholder="one, two, three"
        className={builderFieldClass()}
      />
    );
  }

  // Standard text input
  return (
    <input
      value={typeof value === "string" ? value : String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value"
      className={builderFieldClass()}
    />
  );
}
