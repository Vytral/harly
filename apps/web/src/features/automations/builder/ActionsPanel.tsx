"use client";

import { useState, type ComponentType, type SVGProps } from "react";

import { cn } from "@/lib/utils";

import type { Action, ActionType } from "../schema";
import { actionMeta, pickableActions, type ConfigField } from "./catalog";
import { describeAction } from "./preview";
import { DragHandleIcon } from "./builder-icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * The DO panel: an ordered list of action cards. Each card renders a per-type
 * config editor driven by ACTION_CATALOG. Actions can be reordered (up/down)
 * and removed; a "continue on error" toggle lets a non-critical action not
 * abort the whole run (§2.5). The list is capped at MAX_ACTIONS_PER_WORKFLOW.
 */

const MAX_ACTIONS = 10;

export function ActionsPanel({
  value,
  onChange,
  stageNames,
  members,
}: {
  value: Action[];
  onChange: (a: Action[]) => void;
  stageNames: string[];
  members: { id: string; name: string }[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function update(i: number, patch: Partial<Action>) {
    const next = value.slice();
    next[i] = { ...next[i]!, ...patch };
    onChange(next);
  }
  function setConfig(i: number, key: string, v: unknown) {
    const next = value.slice();
    next[i] = { ...next[i]!, config: { ...next[i]!.config, [key]: v } };
    onChange(next);
  }
  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  }
  function addAction(type: ActionType) {
    if (value.length >= MAX_ACTIONS) return;
    onChange([...value, { type, config: {}, continueOnError: false }]);
    setPickerOpen(false);
  }

  return (
    <div className="space-y-2.5">
      {value.map((action, i) => {
        const meta = actionMeta(action.type);
        return (
          <ActionCard
            key={i}
            index={i}
            total={value.length}
            action={action}
            summary={describeAction(action)}
            icon={meta?.icon}
            label={meta?.label ?? action.type}
            stageNames={stageNames}
            members={members}
            onUpdate={(patch) => update(i, patch)}
            onConfig={(k, v) => setConfig(i, k, v)}
            onRemove={() => remove(i)}
            onMove={(d) => move(i, d)}
          />
        );
      })}

      {value.length < MAX_ACTIONS ? (
        pickerOpen ? (
          <ActionPicker onPick={addAction} onCancel={() => setPickerOpen(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-ink-soft transition-colors hover:border-pine/30 hover:bg-kraft/30 hover:text-foreground"
          >
            + add an action
          </button>
        )
      ) : (
        <p className="text-center text-xs text-ink-soft">Max {MAX_ACTIONS} actions reached.</p>
      )}
    </div>
  );
}

function ActionCard({
  index,
  total,
  action,
  summary,
  icon: Icon,
  label,
  stageNames,
  members,
  onUpdate,
  onConfig,
  onRemove,
  onMove,
}: {
  index: number;
  total: number;
  action: Action;
  summary: string;
  icon?: IconComponent;
  label: string;
  stageNames: string[];
  members: { id: string; name: string }[];
  onUpdate: (patch: Partial<Action>) => void;
  onConfig: (key: string, value: unknown) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const meta = actionMeta(action.type);
  return (
    <div className="rounded-xl border border-border bg-paper-raised p-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className="flex flex-col items-center gap-0.5 pt-1 text-ink-soft/60">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="text-[10px] disabled:opacity-30 hover:text-foreground"
            aria-label="Move up"
          >
            ▲
          </button>
          <DragHandleIcon className="size-3.5" />
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="text-[10px] disabled:opacity-30 hover:text-foreground"
            aria-label="Move down"
          >
            ▼
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              {Icon ? <Icon className="size-4 text-pine" strokeWidth={1.6} /> : null}
              <span className="font-cal text-sm font-semibold text-foreground">{label}</span>
            </span>
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-ink-soft hover:text-rust"
              aria-label="Remove action"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-ink-soft">{summary}</p>

          {/* Config fields */}
          <div className="mt-2.5 space-y-2">
            {meta?.config.map((field) => (
              <ConfigEditor
                key={field.key}
                field={field}
                value={action.config[field.key]}
                stageNames={stageNames}
                members={members}
                onChange={(v) => onConfig(field.key, v)}
              />
            ))}
          </div>

          {/* continueOnError */}
          <label className="mt-2.5 flex items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={Boolean(action.continueOnError)}
              onChange={(e) => onUpdate({ continueOnError: e.target.checked })}
              className="size-3.5 rounded border-border accent-pine"
            />
            Continue on error (don&apos;t abort the run if this fails)
          </label>
        </div>
      </div>
    </div>
  );
}

function ConfigEditor({
  field,
  value,
  stageNames,
  members,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  stageNames: string[];
  members: { id: string; name: string }[];
  onChange: (v: unknown) => void;
}) {
  const base =
    "h-9 w-full rounded-md border border-border bg-kraft/20 px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-pine/30";

  if (field.kind === "textarea") {
    return (
      <div>
        <Label field={field} />
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          rows={3}
          className={cn(base, "min-h-[72px] resize-y py-1.5")}
        />
      </div>
    );
  }

  if (field.kind === "select") {
    return (
      <div>
        <Label field={field} />
        <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">{field.placeholder ?? "Select…"}</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.kind === "stage") {
    return (
      <div>
        <Label field={field} />
        <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">Select a stage…</option>
          {stageNames.length === 0 ? (
            <option value="" disabled>No stages defined yet</option>
          ) : (
            stageNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))
          )}
        </select>
        {stageNames.length === 0 && (
          <p className="mt-1 text-[11px] text-ink-soft">Stages are per-job; create stages on a job first.</p>
        )}
      </div>
    );
  }

  if (field.kind === "owner") {
    return (
      <div>
        <Label field={field} />
        <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">Assign to the workflow owner</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.kind === "keyval") {
    return (
      <div>
        <Label field={field} />
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={cn(base, "min-h-[60px] resize-y py-1.5 font-mono text-xs")}
        />
      </div>
    );
  }

  if (field.kind === "secret-refs") {
    return (
      <div>
        <Label field={field} />
        <input
          value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
          onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          placeholder={field.placeholder}
          className={base}
        />
      </div>
    );
  }

  // text
  return (
    <div>
      <Label field={field} />
      <input
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        className={base}
      />
    </div>
  );
}

function Label({ field }: { field: ConfigField }) {
  return (
    <span className="mb-1 block text-xs font-medium text-ink-soft">
      {field.label}
      {"required" in field && field.required ? <span className="ml-0.5 text-rust">*</span> : null}
    </span>
  );
}

function ActionPicker({ onPick, onCancel }: { onPick: (t: ActionType) => void; onCancel: () => void }) {
  const groups = Array.from(new Set(pickableActions().map((a) => a.group)));
  return (
    <div className="rounded-xl border border-pine/30 bg-paper-raised p-3 shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-cal text-sm font-semibold text-foreground">Pick an action</span>
        <button type="button" onClick={onCancel} className="text-xs text-ink-soft hover:text-foreground">✕</button>
      </div>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{group}</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {pickableActions()
                .filter((a) => a.group === group)
                .map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.type}
                      type="button"
                      onClick={() => onPick(a.type)}
                      className="flex items-start gap-2 rounded-lg border border-border bg-kraft/20 p-2.5 text-left transition-all hover:border-pine/30 hover:bg-kraft/50"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-pine" strokeWidth={1.6} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{a.label}</span>
                        <span className="block truncate text-xs text-ink-soft">{a.blurb}</span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
