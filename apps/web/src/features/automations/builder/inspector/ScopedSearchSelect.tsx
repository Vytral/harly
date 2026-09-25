"use client";

import { useEffect, useId, useRef, useState } from "react";

import { CaretDownIcon } from "@/components/ui/icons/phosphor";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { searchBuilderOptionsAction } from "../../actions";
import type { BuilderSearchItem, BuilderSearchKind } from "../search-kinds";

export function ScopedSearchSelect({
  kind,
  value,
  onChange,
  initialItems,
  placeholder,
  jobId,
  emptyLabel = "None",
  allowEmpty = true,
  disabled = false,
}: {
  kind: BuilderSearchKind;
  value: string;
  onChange: (id: string, item?: BuilderSearchItem) => void;
  initialItems: BuilderSearchItem[];
  placeholder: string;
  jobId?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<BuilderSearchItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<BuilderSearchItem | undefined>();
  const listId = useId();
  const needle = query.trim();
  const queryKeyRef = useRef("");

  useEffect(() => {
    const queryKey = `${kind}:${jobId ?? ""}:${needle}`;
    queryKeyRef.current = queryKey;
    let active = true;
    const reset = window.setTimeout(() => {
      setRemote([]);
      setNextCursor(null);
      setError(null);
      setPending(open && needle.length > 0);
    }, 0);
    if (!open || needle.length === 0) return () => window.clearTimeout(reset);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await searchBuilderOptionsAction({ kind, query: needle, jobId });
          if (!active) return;
          if (result.ok) {
            setRemote(result.items ?? []);
            setNextCursor(result.nextCursor ?? null);
          }
          else setError("Could not search this workspace. Try again.");
        } catch {
          if (active) setError("Search unavailable. Check your connection and try again.");
        } finally {
          if (active) setPending(false);
        }
      })();
    }, 200);
    return () => { active = false; window.clearTimeout(timer); window.clearTimeout(reset); };
  }, [needle, kind, jobId, open]);

  useEffect(() => {
    if (!value || initialItems.some((item) => item.id === value) || picked?.id === value) return;
    let active = true;
    void searchBuilderOptionsAction({ kind, id: value, jobId })
      .then((result) => {
        if (!active || !result.ok) return;
        const item = result.items?.find((candidate) => candidate.id === value);
        if (item) setPicked(item);
      })
      .catch(() => {
        // The raw value remains visible if the resource is no longer available.
      });
    return () => {
      active = false;
    };
  }, [value, kind, jobId, initialItems, picked?.id]);

  async function loadMore() {
    if (!nextCursor || pending || loadingMore) return;
    const queryKey = `${kind}:${jobId ?? ""}:${needle}`;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await searchBuilderOptionsAction({
        kind,
        query: needle,
        jobId,
        cursor: nextCursor,
      });
      if (!result.ok) {
        if (queryKeyRef.current === queryKey) setError("Could not load more results. Try again.");
        return;
      }
      if (queryKeyRef.current !== queryKey) return;
      setRemote((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...(result.items ?? []).filter((item) => !seen.has(item.id))];
      });
      setNextCursor(result.nextCursor ?? null);
    } catch {
      if (queryKeyRef.current === queryKey) setError("Could not load more results. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  const items = needle.length > 0 ? remote : initialItems;
  const selected = initialItems.find((item) => item.id === value) ??
    (picked?.id === value ? picked : undefined) ?? items.find((item) => item.id === value);

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={placeholder}
          disabled={disabled}
          className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-pure-snow px-3 text-left text-xs text-foreground transition-colors duration-150 ease-out hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={cn("truncate", !selected && "text-soft-ink")}>
            {selected ? selected.label : value || placeholder}
          </span>
          <CaretDownIcon className="size-3.5 text-soft-ink" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList id={listId} aria-busy={pending}>
            {pending || error ? <p role="status" className="px-3 py-3 text-xs text-soft-ink">{pending ? "Searching workspace…" : error}</p> : <CommandEmpty>No matches in this workspace.</CommandEmpty>}
            <CommandGroup>
              {allowEmpty ? (
                <CommandItem
                  value={emptyLabel}
                  onSelect={() => {
                    onChange("");
                    setPicked(undefined);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {emptyLabel}
                </CommandItem>
              ) : null}
              {!pending && !error && items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.label} ${item.hint ?? ""} ${item.id}`}
                  onSelect={() => {
                    onChange(item.id, item);
                    setPicked(item);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <span aria-hidden className="w-3 shrink-0">{value === item.id ? "✓" : ""}</span>
                  <span className="min-w-0 break-words">{item.label}</span>
                  {item.hint ? <span className="ml-auto text-[10px] text-soft-ink">{item.hint}</span> : null}
                </CommandItem>
              ))}
              {!pending && !error && needle.length > 0 && nextCursor ? (
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="w-full border-t border-border px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-soft-kraft/50 disabled:opacity-50"
                >
                  {loadingMore ? "Loading more…" : "Load more results"}
                </button>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
