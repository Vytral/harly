"use client";

import { useCallback } from "react";

import { cn } from "@/lib/utils";

import type { ConditionNode, FieldRef, LeafCondition, Operator } from "../schema";
import { OPERATORS } from "../schema";
import { FIELD_KIND_CATALOG, fieldKindMeta, operatorMeta } from "./catalog";

/**
 * The IF panel: a visual editor for the recursive AND/OR/NOT condition tree.
 * The builder stores conditions as an array of root nodes (implicit AND).
 * Empty = always match (the WHEN → DO case).
 *
 * All edits are structural clones (never mutate in place), so React state
 * updates stay correct and the Zod schema can re-validate on save.
 */
export function ConditionPanel({
  value,
  onChange,
}: {
  value: ConditionNode[];
  onChange: (nodes: ConditionNode[]) => void;
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
    () => onChange([...value, { type: "leaf", field: { kind: "candidate", path: "firstName" }, op: "eq", value: "" }]),
    [value, onChange],
  );

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <EmptyConditions onAdd={addRoot} />
      ) : (
        <div className="space-y-2.5">
          {value.map((node, i) => (
            <div key={i}>
              <NodeEditor
                node={node}
                onChange={(n) => update(i, n)}
                onRemove={() => remove(i)}
                depth={0}
              />
              {i < value.length - 1 && (
                <div className="my-1 pl-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">and</div>
              )}
            </div>
          ))}
        </div>
      )}

      {value.length > 0 && (
        <button
          type="button"
          onClick={addRoot}
          className="w-full rounded-lg border border-dashed border-border py-2 text-xs font-medium text-ink-soft transition-colors hover:border-pine/30 hover:bg-kraft/30 hover:text-foreground"
        >
          + add another condition
        </button>
      )}
    </div>
  );
}

function EmptyConditions({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-kraft/20 px-4 py-6 text-center">
      <p className="text-sm font-medium text-foreground">No conditions — runs every time.</p>
      <p className="mt-1 text-xs text-ink-soft">Add an IF to only run when something is true.</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 rounded-lg bg-pine px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-pine-strong"
      >
        + add condition
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recursive node editor
// ---------------------------------------------------------------------------

function NodeEditor({
  node,
  onChange,
  onRemove,
  depth,
}: {
  node: ConditionNode;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
  depth: number;
}) {
  if (node.type === "leaf") return <LeafEditor node={node} onChange={onChange} onRemove={onRemove} />;

  const groupLabel = node.type === "and" ? "All of" : node.type === "or" ? "Any of" : "Not";
  const groupClass = {
    and: "border-pine/20 bg-sage/20",
    or: "border-chart-2/30 bg-chart-2/10",
    not: "border-rust/20 bg-rust/5",
  }[node.type];

  return (
    <div className={cn("rounded-xl border p-2.5", groupClass)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">{groupLabel}</span>
        <div className="flex items-center gap-1">
          {(node.type === "and" || node.type === "or") && (
            <>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...node,
                    children: [...node.children, { type: "leaf", field: { kind: "candidate", path: "firstName" }, op: "eq", value: "" }],
                  })
                }
                className="rounded px-2 py-0.5 text-xs font-medium text-pine hover:bg-pine/10"
              >
                + add
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...node, type: node.type === "and" ? "or" : "and" })}
                className="rounded px-2 py-0.5 text-xs text-ink-soft hover:bg-kraft"
                title="Switch AND / OR"
              >
                ⇄
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="rounded px-1.5 py-0.5 text-xs text-ink-soft hover:text-rust"
            aria-label="Remove group"
          >
            ✕
          </button>
        </div>
      </div>

      {node.type === "not" ? (
        <NodeEditor
          node={node.child}
          onChange={(child) => onChange({ ...node, child })}
          onRemove={onRemove}
          depth={depth + 1}
        />
      ) : node.children.length === 0 ? (
        <p className="px-2 py-1 text-xs italic text-ink-soft">{node.type === "and" ? "always true" : "never"}</p>
      ) : (
        <div className="space-y-2">
          {node.children.map((child, i) => (
            <div key={i}>
              <NodeEditor
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
              />
              {i < node.children.length - 1 && (
                <div className="my-1 pl-3 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  {node.type === "and" ? "and" : "or"}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeafEditor({
  node,
  onChange,
  onRemove,
}: {
  node: Extract<ConditionNode, { type: "leaf" }>;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
}) {
  const opMeta = operatorMeta(node.op);
  const field = node.field;

  function setField(patch: Partial<FieldRef>) {
    onChange({ ...node, field: { ...field, ...patch } as FieldRef });
  }
  function setOp(op: Operator) {
    // Coerce value to the operator's expected kind when switching.
    let value: LeafCondition["value"] = node.value;
    if (op === "is_set" || op === "is_empty") value = null;
    else if (operatorMeta(op).valueKind === "number" && typeof value !== "number") value = 0;
    else if (operatorMeta(op).valueKind === "list" && !Array.isArray(value)) value = [];
    else if (operatorMeta(op).valueKind === "text" && Array.isArray(value)) value = value.join(", ");
    onChange({ ...node, op, value });
  }

  return (
    <div className="rounded-lg border border-border bg-paper-raised p-2.5">
      <div className="flex items-start gap-2">
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr]">
          {/* Field */}
          <div className="flex gap-1.5">
            <select
              value={field.kind}
              onChange={(e) => {
                const kind = e.target.value as FieldRef["kind"];
                if (kind === "literal") setField({ kind, value: "" } as FieldRef);
                else setField({ kind, path: fieldKindMeta(kind).paths[0] ?? "" } as FieldRef);
              }}
              className="h-8 w-[42%] rounded-md border border-border bg-kraft/30 px-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-pine/30"
            >
              {FIELD_KIND_CATALOG.map((f) => (
                <option key={f.kind} value={f.kind}>{f.label}</option>
              ))}
            </select>
            {field.kind === "literal" ? (
              <input
                value={String((field as Extract<FieldRef, { kind: "literal" }>).value ?? "")}
                onChange={(e) => setField({ kind: "literal", value: e.target.value } as FieldRef)}
                placeholder="value"
                className="h-8 flex-1 rounded-md border border-border bg-kraft/30 px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-pine/30"
              />
            ) : (
              <select
                value={(field as Extract<FieldRef, { kind: "candidate" }>).path}
                onChange={(e) => setField({ path: e.target.value } as FieldRef)}
                className="h-8 flex-1 rounded-md border border-border bg-kraft/30 px-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-pine/30"
              >
                {(fieldKindMeta(field.kind).paths.length ? fieldKindMeta(field.kind).paths : ["custom"]).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
                {/* Allow a free-text path if the user typed one not in the quick-picks */}
                {(field as Extract<FieldRef, { kind: "candidate" }>).path &&
                  !fieldKindMeta(field.kind).paths.includes((field as Extract<FieldRef, { kind: "candidate" }>).path) && (
                    <option value={(field as Extract<FieldRef, { kind: "candidate" }>).path}>
                      {(field as Extract<FieldRef, { kind: "candidate" }>).path}
                    </option>
                  )}
              </select>
            )}
          </div>

          {/* Operator */}
          <select
            value={node.op}
            onChange={(e) => setOp(e.target.value as Operator)}
            className="h-8 rounded-md border border-border bg-kraft/30 px-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-pine/30"
          >
            {OPERATORS.map((op) => (
              <option key={op} value={op}>{operatorMeta(op).label}</option>
            ))}
          </select>

          {/* Value */}
          <ValueInput op={node.op} value={node.value} onChange={(value) => onChange({ ...node, value })} />
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="mt-0.5 shrink-0 rounded p-1 text-ink-soft hover:text-rust"
          aria-label="Remove condition"
        >
          ✕
        </button>
      </div>
      {!opMeta.wantsValue && (
        <p className="mt-1.5 text-[11px] text-ink-soft">{opMeta.label} — no value needed.</p>
      )}
    </div>
  );
}

function ValueInput({
  op,
  value,
  onChange,
}: {
  op: Operator;
  value: string | number | boolean | null | Array<string | number | boolean>;
  onChange: (v: string | number | boolean | null | Array<string | number | boolean>) => void;
}) {
  const meta = operatorMeta(op);
  if (!meta.wantsValue) return <span />;

  if (meta.valueKind === "number") {
    return (
      <input
        type="number"
        value={typeof value === "number" ? value : Number(value) || 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-full rounded-md border border-border bg-kraft/30 px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-pine/30"
      />
    );
  }
  if (meta.valueKind === "list") {
    return (
      <input
        value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        placeholder="one, two, three"
        className="h-8 w-full rounded-md border border-border bg-kraft/30 px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-pine/30"
      />
    );
  }
  return (
    <input
      value={typeof value === "string" ? value : String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder="value"
      className="h-8 w-full rounded-md border border-border bg-kraft/30 px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-pine/30"
    />
  );
}
