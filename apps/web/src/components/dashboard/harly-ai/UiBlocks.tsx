"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CheckCircle2, Info, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { updateTask } from "@/features/tasks/actions";
import { toast } from "@/lib/notification-island/toast";
import { cn } from "@/lib/utils";
import {
  presentUiInputSchema,
  type CandidateAction,
  type UiBlock,
} from "@/lib/ai/agent/ui-blocks-schema";

type Send = (message: string) => void;

/**
 * Renders a `presentUi` tool call. Streaming input is partial, so blocks are
 * parsed defensively: only fully-formed blocks render, the rest wait.
 */
export function UiBlocks({ input, onSend, disabled }: { input: unknown; onSend: Send; disabled?: boolean }) {
  const parsed = presentUiInputSchema.safeParse(input);
  if (!parsed.success) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {parsed.data.blocks.map((block, index) => (
        <div
          key={`${block.kind}-${index}`}
          className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-200 motion-reduce:animate-none"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <Block block={block} onSend={onSend} disabled={disabled} />
        </div>
      ))}
    </div>
  );
}

function Block({ block, onSend, disabled }: { block: UiBlock; onSend: Send; disabled?: boolean }) {
  switch (block.kind) {
    case "candidate_list":
      return <CandidateList block={block} onSend={onSend} disabled={disabled} />;
    case "task_list":
      return <TaskList block={block} />;
    case "table":
      return <TableBlock block={block} />;
    case "chart":
      return <ChartBlock block={block} />;
    case "stat_tiles":
      return <StatTiles block={block} />;
    case "choices":
      return <Choices block={block} onSend={onSend} disabled={disabled} />;
    case "form":
      return <FormBlock block={block} onSend={onSend} disabled={disabled} />;
    case "note":
      return <Note block={block} />;
  }
}

function Shell({ title, count, children, className }: { title?: string; count?: number; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-[var(--radius-inner)] border border-hairline bg-pure-snow", className)}>
      {title ? (
        <header className="flex items-center gap-1.5 border-b border-hairline px-3 py-2 text-[13px] font-semibold text-near-ink">
          {title}
          {typeof count === "number" ? <span className="font-chrome text-[11.5px] text-soft-ink tabular-nums">· {count}</span> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

// ── Candidates ─────────────────────────────────────────────────────────────

const ACTION_LABEL: Record<Exclude<CandidateAction, "open">, string> = {
  score: "Score",
  move: "Move",
  reject: "Reject",
  schedule: "Schedule",
  email: "Email",
};

const ACTION_MESSAGE: Record<Exclude<CandidateAction, "open">, (name: string) => string> = {
  score: (name) => `Score ${name}'s CV for the job they applied to.`,
  move: (name) => `Move ${name} to the next stage.`,
  reject: (name) => `Reject ${name}.`,
  schedule: (name) => `Schedule an interview with ${name}.`,
  email: (name) => `Draft an email to ${name}.`,
};

function CandidateList({
  block,
  onSend,
  disabled,
}: {
  block: Extract<UiBlock, { kind: "candidate_list" }>;
  onSend: Send;
  disabled?: boolean;
}) {
  const actions = (block.actions ?? []).filter((a): a is Exclude<CandidateAction, "open"> => a !== "open");
  return (
    <Shell title={block.title} count={block.title ? block.items.length : undefined}>
      <ul className="divide-y divide-hairline">
        {block.items.map((item) => {
          const href = `/dashboard/candidates/${item.candidateId}${item.applicationId ? `?application=${item.applicationId}` : ""}` as Route;
          return (
            <li key={`${item.candidateId}-${item.applicationId ?? ""}`} className="flex items-center gap-2.5 px-3 py-2">
              <UserAvatar name={item.name} size="sm" />
              <Link href={href} className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink">
                <span className="block truncate text-[13px] font-medium text-near-ink hover:underline">{item.name}</span>
                <span className="block truncate text-[11.5px] text-soft-ink">
                  {[item.subtitle, item.stage, typeof item.waitingDays === "number" ? waitingLabel(item.waitingDays) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
              <div className="flex shrink-0 gap-1">
                {actions.map((action) => (
                  <Button
                    key={action}
                    size="xs"
                    variant={action === "reject" ? "ghost" : "outline"}
                    className={cn("h-7 px-2 text-[12px]", action === "reject" && "text-danger-rust")}
                    disabled={disabled}
                    onClick={() => onSend(ACTION_MESSAGE[action](item.name))}
                  >
                    {ACTION_LABEL[action]}
                  </Button>
                ))}
                {actions.length === 0 ? (
                  <Link
                    href={href}
                    aria-label={`Open ${item.name}`}
                    className="grid size-7 place-items-center rounded-md text-soft-ink hover:bg-card-inset hover:text-near-ink"
                  >
                    <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}

function waitingLabel(days: number) {
  if (days === 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}

// ── Tasks ──────────────────────────────────────────────────────────────────

function TaskList({ block }: { block: Extract<UiBlock, { kind: "task_list" }> }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  async function complete(taskId: string, title: string) {
    setDone((previous) => ({ ...previous, [taskId]: true }));
    const result = await updateTask({ taskId, status: "completed" });
    if (!result.success) {
      setDone((previous) => ({ ...previous, [taskId]: false }));
      toast.error(result.error ?? "Couldn't complete the task.");
      return;
    }
    toast.success(title.length > 28 ? "Task completed" : `Done: ${title}`);
  }
  return (
    <Shell title={block.title}>
      <ul className="divide-y divide-hairline">
        {block.items.map((item, index) => {
          const checked = item.done || (item.taskId ? done[item.taskId] : false);
          return (
            <li key={item.taskId ?? index} className="flex items-start gap-2.5 px-3 py-2">
              {item.taskId ? (
                <Checkbox
                  className="mt-0.5"
                  checked={Boolean(checked)}
                  disabled={Boolean(checked)}
                  onCheckedChange={() => item.taskId && complete(item.taskId, item.title)}
                  aria-label={`Complete ${item.title}`}
                />
              ) : (
                <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-quiet-mist" />
              )}
              <div className="min-w-0 flex-1">
                {item.href ? (
                  <Link href={item.href as Route} className={cn("block text-[13px] text-near-ink hover:underline", checked && "text-soft-ink line-through")}>
                    {item.title}
                  </Link>
                ) : (
                  <p className={cn("text-[13px] text-near-ink", checked && "text-soft-ink line-through")}>{item.title}</p>
                )}
                {item.due ? <p className="text-[11.5px] text-soft-ink">{item.due}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────

function TableBlock({ block }: { block: Extract<UiBlock, { kind: "table" }> }) {
  return (
    <Shell title={block.title}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="bg-card-inset">
              {block.columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-1.5 font-medium text-soft-ink">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {block.rows.map((row, r) => (
              <tr key={r}>
                {block.columns.map((_, c) => (
                  <td key={c} className={cn("px-3 py-1.5 text-near-ink", c === 0 && "font-medium")}>
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function ChartBlock({ block }: { block: Extract<UiBlock, { kind: "chart" }> }) {
  const max = Math.max(1, ...block.data.map((d) => d.value));
  const fmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}${block.unit ?? ""}`;
  if (block.type === "line") {
    const w = 280;
    const h = 72;
    const step = block.data.length > 1 ? w / (block.data.length - 1) : w;
    const points = block.data.map((d, i) => `${i * step},${h - (d.value / max) * (h - 6) - 3}`).join(" ");
    return (
      <Shell title={block.title}>
        <div className="px-3 py-3">
          <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full" role="img" aria-label={block.title ?? "Line chart"}>
            <polyline points={points} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <div className="mt-1 flex justify-between text-[11px] text-soft-ink">
            <span>{block.data[0]?.label}</span>
            <span>{block.data.at(-1)?.label} · {fmt(block.data.at(-1)?.value ?? 0)}</span>
          </div>
        </div>
      </Shell>
    );
  }
  return (
    <Shell title={block.title}>
      <ul className="flex flex-col gap-1.5 px-3 py-2.5">
        {block.data.map((d, i) => (
          <li key={`${d.label}-${i}`} className="grid grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-2 text-[12px]">
            <span className="truncate text-soft-ink">{d.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-card-inset">
              <span
                className="block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: i === block.data.length - 1 ? "var(--chart-2)" : "var(--chart-1)" }}
              />
            </span>
            <span className="font-medium tabular-nums text-near-ink">{fmt(d.value)}</span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function StatTiles({ block }: { block: Extract<UiBlock, { kind: "stat_tiles" }> }) {
  return (
    <div className={cn("grid gap-1.5", block.items.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
      {block.items.map((item) => (
        <div key={item.label} className="rounded-[var(--radius-inner)] bg-card-inset px-3 py-2.5">
          <p className="truncate text-[11.5px] text-soft-ink">{item.label}</p>
          <p className="font-display text-[22px] leading-tight tabular-nums text-near-ink">{item.value}</p>
          {item.hint ? <p className="truncate text-[11px] text-soft-ink">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

// ── Interaction ────────────────────────────────────────────────────────────

function Choices({ block, onSend, disabled }: { block: Extract<UiBlock, { kind: "choices" }>; onSend: Send; disabled?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      {block.prompt ? <p className="text-[12.5px] text-soft-ink">{block.prompt}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {block.options.map((option) => (
          <button
            key={option.label}
            type="button"
            disabled={disabled || picked !== null}
            onClick={() => {
              setPicked(option.label);
              onSend(option.message);
            }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink disabled:cursor-default",
              picked === option.label
                ? "border-near-ink bg-near-ink text-pure-snow"
                : "border-mist-border bg-pure-snow text-near-ink hover:bg-card-inset disabled:opacity-50",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FormBlock({ block, onSend, disabled }: { block: Extract<UiBlock, { kind: "form" }>; onSend: Send; disabled?: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(block.fields.map((field) => [field.name, field.value ?? ""])),
  );
  const [sent, setSent] = useState(false);
  const missing = block.fields.some((field) => field.required && !values[field.name]?.trim());

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (missing || sent) return;
    const details = block.fields
      .map((field) => `${field.label}: ${values[field.name]?.trim() || "—"}`)
      .join("; ");
    setSent(true);
    onSend(`${block.intent}. ${details}.`);
  }

  return (
    <Shell title={block.title}>
      <form onSubmit={submit} className="flex flex-col gap-2.5 px-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          {block.fields.map((field) => {
            const id = `ui-form-${block.title}-${field.name}`.replace(/\s+/g, "-");
            const wide = field.type === "textarea" || field.type === "select" || block.fields.length === 1;
            return (
              <label key={field.name} htmlFor={id} className={cn("flex flex-col gap-1", wide && "col-span-2")}>
                <span className="text-[12px] font-medium text-near-ink">
                  {field.label}
                  {field.required ? <span className="text-danger-rust"> *</span> : null}
                </span>
                {field.type === "textarea" ? (
                  <Textarea
                    id={id}
                    value={values[field.name]}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    disabled={sent}
                    className="min-h-16 text-[13px]"
                  />
                ) : field.type === "select" ? (
                  <select
                    id={id}
                    value={values[field.name]}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    disabled={sent}
                    className="h-9 rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-2.5 text-[13px] text-near-ink focus-visible:border-near-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-near-ink/10"
                  >
                    <option value="">Choose…</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={id}
                    type={field.type}
                    value={values[field.name]}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    disabled={sent}
                    className="h-9 text-[13px]"
                  />
                )}
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2">
          {sent ? <span className="text-[12px] text-soft-ink">Sent. Review the confirmation below.</span> : null}
          <Button type="submit" size="sm" className="h-8 text-[13px]" disabled={disabled || missing || sent}>
            {block.submitLabel}
          </Button>
        </div>
      </form>
    </Shell>
  );
}

function Note({ block }: { block: Extract<UiBlock, { kind: "note" }> }) {
  const Icon = block.tone === "warning" ? TriangleAlert : block.tone === "success" ? CheckCircle2 : Info;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-[var(--radius-inner)] px-3 py-2 text-[12.5px] leading-snug",
        block.tone === "warning" && "bg-warning-clay/10 text-warning-clay",
        block.tone === "success" && "bg-sage-wash text-sage-ink",
        block.tone === "info" && "bg-card-inset text-soft-ink",
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <p>{block.text}</p>
    </div>
  );
}
