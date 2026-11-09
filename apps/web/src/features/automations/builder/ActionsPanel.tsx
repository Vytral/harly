"use client";

import { useState, type ComponentType, type SVGProps } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { MAX_ACTIONS_PER_WORKFLOW, type Action, type ActionType } from "../schema";
import { actionMeta, pickableActions, type ConfigField } from "./catalog";
import { describeAction } from "./preview";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "./builder-icons";
import { BuilderSelect } from "./inspector/BuilderSelect";
import { builderFieldClass } from "./field-styles";
import { DocumentItemsEditor } from "./DocumentItemsEditor";
import { SignatureRecipientsEditor } from "./SignatureRecipientsEditor";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const MAX_ACTIONS = MAX_ACTIONS_PER_WORKFLOW;

const VARIABLE_CHIPS = [
  { id: "candidateName", value: "{{candidate_first_name}}" },
  { id: "jobTitle", value: "{{job_title}}" },
  { id: "company", value: "{{company_name}}" },
] as const;

/**
 * The DO panel: an ordered list of human-friendly action cards.
 * Provides custom pickers for email templates, relative due dates,
 * tags, stage transitions, and assignee members.
 */
export function ActionsPanel({
  value,
  onChange,
  stageNames = [],
  members = [],
  emailTemplates = [],
  tags = [],
  startWithPicker = false,
}: {
  value: Action[];
  onChange: (a: Action[]) => void;
  stageNames?: string[];
  members?: { id: string; name: string; email?: string }[];
  emailTemplates?: { id: string; name: string; subject: string; type: string }[];
  tags?: string[];
  startWithPicker?: boolean;
}) {
  const t = useTranslations("features.automations.ActionsPanel");
  const tl = useTranslations("labels.automations");
  const [pickerOpen, setPickerOpen] = useState(startWithPicker && value.length === 0);

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
    const initialConfig: Record<string, unknown> = {};
    if (type === "create_task") {
      initialConfig.dueOffsetDays = 2;
      initialConfig.priority = "medium";
    }
    if (type === "request_documents") {
      initialConfig.items = [{ title: "", instructions: "" }];
    }
    if (type === "generate_document") {
      initialConfig.title = "Generated document";
      initialConfig.body = "Dear {{candidate_full_name}},\n\n";
    }
    if (type === "schedule_interview") {
      initialConfig.type = "screening";
      initialConfig.mode = "video";
      initialConfig.durationMins = 45;
    }
    onChange([...value, { type, config: initialConfig, continueOnError: false }]);
    setPickerOpen(false);
  }

  return (
    <div className="space-y-0">
      {value.map((action, i) => {
        const meta = actionMeta(action.type, tl);
        return (
          <div key={i}>
            <span className="flex items-center gap-2 pb-1.5 pl-1">
              <span className="flex size-4 items-center justify-center rounded-full bg-soft-kraft text-[10px] font-semibold text-soft-ink">
                {i + 1}
              </span>
              <span className="font-chrome text-[11px] uppercase tracking-wider text-soft-ink">
                {t("step", { number: i + 1 })}
              </span>
            </span>
            <ActionCard
              index={i}
              total={value.length}
              action={action}
              summary={describeAction(action, tl)}
              icon={meta?.icon}
              label={meta?.label ?? action.type}
              stageNames={stageNames}
              members={members}
              emailTemplates={emailTemplates}
              tags={tags}
              onUpdate={(patch) => update(i, patch)}
              onConfig={(k, v) => setConfig(i, k, v)}
              onRemove={() => remove(i)}
              onMove={(d) => move(i, d)}
            />
            {i < value.length - 1 && <ActionConnector />}
          </div>
        );
      })}

      {value.length < MAX_ACTIONS ? (
        pickerOpen ? (
          <div className={value.length > 0 ? "mt-3" : undefined}>
            <ActionPicker onPick={addAction} onCancel={() => setPickerOpen(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-sm font-medium transition-colors duration-150 ease-out hover:border-foreground/30 hover:bg-soft-kraft/40 hover:text-foreground",
              value.length > 0
                ? "mt-3 text-soft-ink"
                : "bg-near-ink text-primary-foreground border-near-ink hover:bg-near-ink/90 hover:text-primary-foreground",
            )}
          >
            {value.length > 0 ? t("addAnother") : t("chooseAction")}
          </button>
        )
      ) : (
        <p className="mt-3 text-center text-xs text-soft-ink">
          {t("maxReached", { max: MAX_ACTIONS })}
        </p>
      )}
    </div>
  );
}

function ActionConnector() {
  return <div className="ml-[9px] h-4 w-px border-l border-dashed border-border" aria-hidden />;
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
  emailTemplates,
  tags,
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
  members: { id: string; name: string; email?: string }[];
  emailTemplates: { id: string; name: string; subject: string; type: string }[];
  tags: string[];
  onUpdate: (patch: Partial<Action>) => void;
  onConfig: (key: string, value: unknown) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const t = useTranslations("features.automations.ActionsPanel");
  const tl = useTranslations("labels.automations");
  const meta = actionMeta(action.type, tl);

  return (
    <div className="rounded-xl border border-border bg-warm-paper p-4 shadow-xs transition-colors duration-150 ease-out">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-soft-kraft text-foreground">
          {Icon ? <Icon className="size-4" strokeWidth={1.7} /> : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display text-sm font-semibold text-foreground">
              {label}
            </span>
            <div className="flex items-center gap-0.5 text-soft-ink">
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={index === 0}
                className="rounded p-1 hover:bg-soft-kraft hover:text-foreground disabled:opacity-25"
                aria-label={t("moveUp")}
              >
                <ChevronUpIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={index === total - 1}
                className="rounded p-1 hover:bg-soft-kraft hover:text-foreground disabled:opacity-25"
                aria-label={t("moveDown")}
              >
                <ChevronDownIcon className="size-3.5" />
              </button>
              <span className="mx-0.5 h-3.5 w-px bg-hairline-c" aria-hidden />
              <button
                type="button"
                onClick={onRemove}
                className="rounded p-1 hover:bg-danger-rust/10 hover:text-danger-rust"
                aria-label={t("removeAction")}
              >
                <CloseIcon className="size-3.5" />
              </button>
            </div>
          </div>
          <p className="mt-0.5 text-xs text-soft-ink">{summary}</p>

          {/* Config fields */}
          <div className="mt-3 space-y-2.5">
            {meta?.config.map((field) => (
              <ConfigEditor
                key={field.key}
                field={field}
                value={action.config[field.key]}
                stageNames={stageNames}
                members={members}
                emailTemplates={emailTemplates}
                tags={tags}
                onChange={(v) => onConfig(field.key, v)}
              />
            ))}
          </div>

          {/* Variable pills helper for text/message actions */}
          {(action.type === "send_slack" ||
            action.type === "send_email" ||
            action.type === "send_booking_link" ||
            action.type === "add_note") && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1 text-[11px] text-soft-ink">
              <span>{t("insertVariable")}</span>
              {VARIABLE_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => {
                    const targetKey =
                      action.type === "send_slack"
                        ? "message"
                        : action.type === "add_note"
                          ? "body"
                          : "body";
                    const current = String(action.config[targetKey] ?? "");
                    onConfig(
                      targetKey,
                      current ? `${current} ${chip.value}` : chip.value,
                    );
                  }}
                  className="rounded-md border border-border/80 bg-pure-snow px-1.5 py-0.5 text-[10px] font-mono text-foreground hover:bg-soft-kraft transition-colors duration-150 ease-out"
                >
                  {t(`variables.${chip.id}`)}
                </button>
              ))}
            </div>
          )}

          {/* continueOnError toggle */}
          <label className="mt-3 flex items-center gap-2 border-t border-hairline-c pt-2.5 text-xs text-soft-ink cursor-pointer select-none">
            <input
              type="checkbox"
              checked={Boolean(action.continueOnError)}
              onChange={(e) => onUpdate({ continueOnError: e.target.checked })}
              className="size-3.5 rounded border-border accent-foreground"
            />
            {t("continueOnError")}
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
  emailTemplates,
  tags,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  stageNames: string[];
  members: { id: string; name: string; email?: string }[];
  emailTemplates: { id: string; name: string; subject: string; type: string }[];
  tags: string[];
  onChange: (v: unknown) => void;
}) {
  const base = builderFieldClass();
  const t = useTranslations("features.automations.ActionsPanel");

  if (field.kind === "datetime") {
    const parsedValue = typeof value === "string" && value ? new Date(value) : null;
    const localValue = parsedValue && !Number.isNaN(parsedValue.getTime())
      ? parsedValue.toISOString().slice(0, 16)
      : "";
    return (
      <div>
        <Label field={field} />
        <input
          type="datetime-local"
          value={localValue}
          required={field.required}
          onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : field.required ? "" : undefined)}
          className={base}
        />
      </div>
    );
  }

  // Email Template Picker
  if (field.kind === "email-template") {
    return (
      <div>
        <Label field={field} />
        <BuilderSelect
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={base}
        >
          <option value="">{t("chooseEmailTemplate")}</option>
          {emailTemplates.length === 0 ? (
            <option value="" disabled>
              {t("noEmailTemplates")}
            </option>
          ) : (
            emailTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.type})
              </option>
            ))
          )}
        </BuilderSelect>
      </div>
    );
  }

  // Relative Due Date Picker
  if (field.kind === "due-offset") {
    const numVal = typeof value === "number" ? value : Number(value) || 0;
    return (
      <div>
        <Label field={field} />
        <BuilderSelect
          value={String(numVal)}
          onChange={(e) => onChange(Number(e.target.value))}
          className={base}
        >
          <option value="0">{t("dueOffset.sameDay")}</option>
          <option value="1">{t("dueOffset.inDays", { count: 1 })}</option>
          <option value="2">{t("dueOffset.inDays", { count: 2 })}</option>
          <option value="3">{t("dueOffset.inDays", { count: 3 })}</option>
          <option value="5">{t("dueOffset.inDays", { count: 5 })}</option>
          <option value="7">{t("dueOffset.oneWeek")}</option>
          <option value="14">{t("dueOffset.twoWeeks")}</option>
        </BuilderSelect>
      </div>
    );
  }

  // Candidate Tag Picker with autocomplete datalist
  if (field.kind === "tag") {
    return (
      <div>
        <Label field={field} />
        <div className="relative">
          <input
            list="action-tag-list"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("tagPlaceholder")}
            className={base}
          />
          <datalist id="action-tag-list">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>
    );
  }

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
          className={cn(base, "min-h-[72px] resize-y py-2")}
        />
      </div>
    );
  }

  if (field.kind === "document-list") {
    return (
      <div>
        <Label field={field} />
        <DocumentItemsEditor value={value} onChange={onChange} />
      </div>
    );
  }

  if (field.kind === "recipient-list") {
    return (
      <div>
        <Label field={field} />
        <SignatureRecipientsEditor value={value} onChange={onChange} />
      </div>
    );
  }

  if (field.kind === "select") {
    return (
      <div>
        <Label field={field} />
        <BuilderSelect
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        >
          <option value="">{field.placeholder ?? t("selectFallback")}</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </BuilderSelect>
      </div>
    );
  }

  if (field.kind === "stage") {
    return (
      <div>
        <Label field={field} />
        <BuilderSelect
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        >
          <option value="">{t("selectStage")}</option>
          {stageNames.length === 0 ? (
            <option value="" disabled>
              {t("noStages")}
            </option>
          ) : (
            stageNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))
          )}
        </BuilderSelect>
      </div>
    );
  }

  if (field.kind === "owner") {
    return (
      <div>
        <Label field={field} />
        <BuilderSelect
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        >
          <option value="">{t("assignOwner")}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </BuilderSelect>
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
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          placeholder={field.placeholder}
          className={base}
        />
      </div>
    );
  }

  return (
    <div>
      <Label field={field} />
      <input
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        maxLength={"maxLength" in field ? field.maxLength : undefined}
        placeholder={"placeholder" in field ? field.placeholder : undefined}
        className={base}
      />
    </div>
  );
}

function Label({ field }: { field: ConfigField }) {
  return (
    <span className="mb-1 block text-xs font-medium text-foreground">
      {field.label}
      {"required" in field && field.required ? (
        <span className="ml-0.5 text-danger-rust">*</span>
      ) : null}
    </span>
  );
}

function ActionPicker({
  onPick,
  onCancel,
}: {
  onPick: (t: ActionType) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("features.automations.ActionsPanel");
  const tl = useTranslations("labels.automations");
  const pickable = pickableActions(undefined, tl);
  const groups = Array.from(new Map(pickable.map((a) => [a.group, a.groupLabel] as const)));

  return (
    <div className="rounded-xl border border-border bg-warm-paper p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-sm font-semibold text-foreground">
          {t("chooseAction")}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1 text-soft-ink hover:bg-soft-kraft hover:text-foreground"
          aria-label={t("cancel")}
        >
          <CloseIcon className="size-3.5" />
        </button>
      </div>
      <div className="space-y-4">
        {groups.map(([group, groupLabel]) => (
          <div key={group}>
            <p className="font-chrome mb-1.5 text-[11px] uppercase tracking-wider text-soft-ink">
              {groupLabel}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {pickable
                .filter((a) => a.group === group)
                .map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.type}
                      type="button"
                      onClick={() => onPick(a.type)}
                      className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-pure-snow p-2.5 text-left transition-all duration-150 ease-out hover:border-foreground/30 hover:bg-soft-kraft/40"
                    >
                      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-soft-kraft text-foreground">
                        <Icon className="size-3.5" strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          {a.label}
                        </span>
                        <span className="block truncate text-xs text-soft-ink">
                          {a.blurb}
                        </span>
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
