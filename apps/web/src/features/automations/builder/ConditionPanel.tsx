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
        <TreeList>
          {value.map((node, i) => (
            <NodeEditor
              key={i}
              node={node}
              onChange={(n) => update(i, n)}
              onRemove={() => remove(i)}
              depth={0}
              joiner={i < value.length - 1 ? "and" : undefined}
            />
          ))}
        </TreeList>
      )}

      {value.length > 0 && (
        <button
          type="button"
          onClick={addRoot}
          className="w-full rounded-md border border-dashed border-mist-border py-2 text-xs font-medium text-ink-soft transition-colors hover:border-foreground/20 hover:bg-row-wash/50 hover:text-foreground"
        >
          + add another condition
        </button>
      )}
    </div>
  );
}

function EmptyConditions({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-mist-border bg-kraft/30 px-4 py-6 text-center">
      <p className="text-sm font-medium text-foreground">No conditions — runs every time.</p>
      <p className="mt-1 text-xs text-ink-soft">Add an IF to only run when something is true.</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/85"
      >
        + add condition
      </button>
    </div>
  );
}

/** A joiner pill ("and" / "or") that sits centered on the tree's connector rail. */
function Joiner({ word }: { word: "and" | "or" }) {
  return (
    <div className="relative flex h-6 items-center pl-[15px]" aria-hidden>
      <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft ring-4 ring-paper">
        {word}
      </span>
    </div>
  );
}

/** Vertical rail connecting sibling nodes at the top level — no group chrome, just a tree guide. */
function TreeList({ children }: { children: React.ReactNode }) {
  return <div className="relative space-y-0 border-l border-dashed border-mist-border pl-4">{children}</div>;
}

// ---------------------------------------------------------------------------
// Recursive node editor
// ---------------------------------------------------------------------------

function NodeEditor({
  node,
  onChange,
  onRemove,
  depth,
  joiner,
}: {
  node: ConditionNode;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
  depth: number;
  joiner?: "and" | "or";
}) {
  return (
    <div className="relative">
      <div className="absolute -left-4 top-4 h-px w-4 border-t border-dashed border-mist-border" aria-hidden />
      {node.type === "leaf" ? (
        <LeafEditor node={node} onChange={onChange} onRemove={onRemove} />
      ) : (
        <GroupEditor node={node} onChange={onChange} onRemove={onRemove} depth={depth} />
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
}: {
  node: Extract<ConditionNode, { type: "and" | "or" | "not" }>;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
  depth: number;
}) {
  const groupLabel = node.type === "and" ? "All of" : node.type === "or" ? "Any of" : "Not";
  const badgeClass =
    node.type === "or" ? "bg-sage text-sage-ink" : node.type === "not" ? "bg-rust/10 text-rust" : "bg-kraft text-ink-soft";

  return (
    <div className="rounded-lg border border-mist-border bg-paper-raised p-3 shadow-soft">
      <div className="mb-2.5 flex items-center justify-between">
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", badgeClass)}>
          {groupLabel}
        </span>
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
                className="rounded px-2 py-1 text-xs font-medium text-foreground hover:bg-row-wash"
              >
                + add
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...node, type: node.type === "and" ? "or" : "and" })}
                className="rounded px-1.5 py-1 text-xs text-ink-soft hover:bg-kraft hover:text-foreground"
                title="Switch AND / OR"
                aria-label="Switch AND / OR"
              >
                ⇄
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="rounded px-1.5 py-1 text-xs text-ink-soft hover:text-rust"
            aria-label="Remove group"
          >
            ✕
          </button>
        </div>
      </div>

      {node.type === "not" ? (
        <TreeList>
          <NodeEditor node={node.child} onChange={(child) => onChange({ ...node, child })} onRemove={onRemove} depth={depth + 1} />
        </TreeList>
      ) : node.children.length === 0 ? (
        <p className="px-2 py-1 text-xs italic text-ink-soft">{node.type === "and" ? "always true" : "never"}</p>
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
              joiner={i < node.children.length - 1 ? (node.type === "and" ? "and" : "or") : undefined}
            />
          ))}
        </TreeList>
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
    <div className="rounded-lg border border-mist-border bg-paper-raised p-3 shadow-soft">
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
              className="h-9 w-[42%] rounded-md border border-mist-border bg-kraft/40 px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
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
                className="h-9 flex-1 rounded-md border border-mist-border bg-kraft/40 px-2.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
              />
            ) : (
              <select
                value={(field as Extract<FieldRef, { kind: "candidate" }>).path}
                onChange={(e) => setField({ path: e.target.value } as FieldRef)}
                className="h-9 flex-1 rounded-md border border-mist-border bg-kraft/40 px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
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
            className="h-9 rounded-md border border-mist-border bg-kraft/40 px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
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
          className="mt-0.5 shrink-0 rounded p-1.5 text-ink-soft hover:text-rust"
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
        className="h-9 w-full rounded-md border border-mist-border bg-kraft/40 px-2.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
      />
    );
  }
  if (meta.valueKind === "list") {
    return (
      <input
        value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        placeholder="one, two, three"
        className="h-9 w-full rounded-md border border-mist-border bg-kraft/40 px-2.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
      />
    );
  }
  return (
    <input
      value={typeof value === "string" ? value : String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder="value"
      className="h-9 w-full rounded-md border border-mist-border bg-kraft/40 px-2.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
    />
  );
}
