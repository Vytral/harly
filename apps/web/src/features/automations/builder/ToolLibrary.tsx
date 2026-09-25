"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckSquare,
  Clock,
  GitBranch,
  Mail,
  OctagonX,
  Play,
  Plus,
  Search,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { filterLibraryItems, libraryItems, type LibraryItem } from "./library";
import type { BlockKind } from "./state/blocks";
import type { SafeAutomationToolManifest } from "./catalog";

function getLibraryItemIcon(item: LibraryItem) {
  if (item.kind === "trigger") return Zap;
  if (item.kind === "condition") return GitBranch;
  if (item.kind === "delay" || item.kind === "wait") return Clock;
  if (item.kind === "approval") return ShieldCheck;
  if (item.kind === "end") return OctagonX;
  if (item.actionType === "send_email") return Mail;
  if (item.actionType === "move_stage") return ArrowRight;
  if (item.actionType === "add_note") return CheckSquare;
  return Play;
}

export function ToolLibrary({
  onAdd,
  hasTrigger,
  searchRef,
  toolManifests,
}: {
  onAdd: (kind: BlockKind, actionType?: string, toolVersion?: number) => void;
  hasTrigger: boolean;
  searchRef?: React.MutableRefObject<(() => void) | null>;
  toolManifests: readonly SafeAutomationToolManifest[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const items = useMemo(() => libraryItems(toolManifests), [toolManifests]);
  const filtered = filterLibraryItems(items, query);
  const groups = [...new Set(filtered.map((item) => item.group))];

  const frequentlyUsed = useMemo(
    () =>
      items.filter((item) =>
        [
          "action:send_email",
          "delay",
          "condition",
          "action:move_stage",
          "action:add_note",
        ].includes(item.id),
      ),
    [items],
  );

  useEffect(() => {
    if (!searchRef) return;
    searchRef.current = () => inputRef.current?.focus();
  }, [searchRef]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-warm-paper">
      <div className="border-b border-hairline-c px-3 py-3">
        <p className="font-display text-sm font-semibold text-foreground">
          Step library
        </p>
        <p className="mt-1 text-xs leading-relaxed text-soft-ink">
          Drag onto the canvas, or click to add. Connect steps to define your flow.
        </p>
        <div className="relative mt-3">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-pure-snow px-3 py-2 focus-within:ring-1 focus-within:ring-foreground/30">
            <Search className="size-3.5 text-soft-ink shrink-0" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search steps…"
              className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-soft-ink"
              aria-label="Search steps"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-soft-ink hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3" />
              </button>
            )}
          </label>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {!query && frequentlyUsed.length > 0 && (
          <div>
            <p className="font-chrome px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-soft-ink">
              Frequently used
            </p>
            <div className="space-y-1">
              {frequentlyUsed.map((item) => {
                const Icon = getLibraryItemIcon(item);
                return (
                  <button
                    key={`freq-${item.id}`}
                    type="button"
                    draggable
                    onClick={() => onAdd(item.kind, item.actionType, item.toolVersion)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/harly-block", item.kind);
                      if (item.actionType) {
                        event.dataTransfer.setData(
                          "application/harly-action",
                          item.actionType,
                        );
                      }
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    className="group flex w-full items-start gap-2.5 rounded-lg border border-border/60 bg-pure-snow p-2 text-left transition-colors duration-150 ease-out hover:border-foreground/25 hover:bg-soft-kraft/40 active:scale-[0.99]"
                  >
                    <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-soft-kraft text-soft-ink group-hover:bg-foreground group-hover:text-background transition-colors">
                      <Icon className="size-3" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {item.label}
                        </span>
                        <Plus className="size-3 shrink-0 text-soft-ink group-hover:text-foreground transition-colors" />
                      </div>
                      <p className="mt-0.5 text-[11px] leading-tight text-soft-ink line-clamp-1">
                        {item.blurb}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-soft-ink">No steps match “{query}”.</p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-2 text-xs font-medium text-foreground underline underline-offset-2"
            >
              Clear search
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group}>
              <p className="font-chrome px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-soft-ink">
                {group}{" "}
                <span className="ml-1 opacity-60">
                  {filtered.filter((item) => item.group === group).length}
                </span>
              </p>
              <div className="space-y-1">
                {filtered
                  .filter((item) => item.group === group)
                  .map((item) => {
                    const disabled = item.kind === "trigger" && hasTrigger;
                    const Icon = getLibraryItemIcon(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        draggable={!disabled}
                        disabled={disabled}
                        onClick={() => onAdd(item.kind, item.actionType, item.toolVersion)}
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "application/harly-block",
                            item.kind,
                          );
                          if (item.actionType) {
                            event.dataTransfer.setData(
                              "application/harly-action",
                              item.actionType,
                            );
                          }
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        className={cn(
                          "group flex w-full items-start gap-2.5 rounded-lg border border-border/60 bg-pure-snow p-2 text-left transition-colors duration-150 ease-out hover:border-foreground/25 hover:bg-soft-kraft/40 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 active:cursor-grabbing",
                        )}
                      >
                        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-soft-kraft text-soft-ink group-hover:bg-foreground group-hover:text-background transition-colors">
                          <Icon className="size-3" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-foreground truncate">
                              {item.label}
                            </span>
                            <Plus className="size-3 shrink-0 text-soft-ink group-hover:text-foreground transition-colors" />
                          </div>
                          <p className="mt-0.5 text-[11px] leading-tight text-soft-ink line-clamp-1">
                            {disabled ? "One trigger per automation" : item.blurb}
                          </p>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
