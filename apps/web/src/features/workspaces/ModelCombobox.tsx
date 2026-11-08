"use client";

import { useState } from "react";
import { ChevronsUpDown, Check, TriangleAlert } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SpinnerIcon } from "@/components/ui/icons/phosphor";
import {
  formatContextWindow,
  formatPricePerM,
  lacksToolCalling,
  type ModelOption,
} from "@/lib/ai/model-options";
import { cn } from "@/lib/utils";

function Chip({ children, tone }: { children: React.ReactNode; tone?: "warn" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-1.5 py-px text-[10.5px] leading-4 font-medium",
        tone === "warn"
          ? "border-clay/30 bg-clay/5 text-clay"
          : "border-hairline bg-card-inset text-soft-ink",
      )}
    >
      {children}
    </span>
  );
}

function ModelChips({ model }: { model: ModelOption }) {
  const price = formatPricePerM(model.inputCostPerM, model.outputCostPerM);
  const ctx = formatContextWindow(model.contextWindow);
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {ctx ? <Chip>{ctx}</Chip> : null}
      {model.toolCall ? <Chip>tools</Chip> : null}
      {model.reasoning ? <Chip>reasoning</Chip> : null}
      {model.attachments ? <Chip>images</Chip> : null}
      {price ? <Chip>{price}</Chip> : null}
      {lacksToolCalling(model) ? <Chip tone="warn">no tool calling</Chip> : null}
      {model.deprecated ? <Chip tone="warn">deprecated</Chip> : null}
    </span>
  );
}

/**
 * Searchable model picker. Lists a provider's models (name, context window,
 * capability chips, price) and always lets the user type any model ID.
 * Rendered as a button + popover, so no text input sits next to the key field.
 */
export function ModelCombobox({
  id,
  value,
  onChange,
  models,
  loading,
  placeholder,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (modelId: string) => void;
  models: ModelOption[];
  loading?: boolean;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const typed = search.trim();
  const canUseTyped = typed.length > 0 && !models.some((m) => m.id === typed);

  function pick(modelId: string) {
    onChange(modelId);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={id ? `${id}-listbox` : undefined}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3 text-left text-base transition-[color,box-shadow,border-color] duration-150 ease-out outline-none md:text-sm",
            "hover:border-quiet-mist/70 focus-visible:border-near-ink focus-visible:ring-[3px] focus-visible:ring-near-ink/10 disabled:cursor-not-allowed disabled:bg-card-inset",
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {value ? (
              <span className="font-mono text-sm text-near-ink">{value}</span>
            ) : (
              <span className="text-quiet-mist">{placeholder}</span>
            )}
          </span>
          {loading ? (
            <SpinnerIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <Command
          // Filtering is by id and name; typed IDs get their own row below.
          filter={(itemValue, query) =>
            itemValue.toLowerCase().includes(query.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search models or type an ID…"
            name="ai_model_search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
          />
          <CommandList className="max-h-72">
            {canUseTyped ? (
              <CommandItem
                value={`__use__${typed}`}
                forceMount
                onSelect={() => pick(typed)}
                className="mx-1 mt-1"
              >
                <span className="min-w-0 truncate">
                  Use <span className="font-mono">{typed}</span>
                </span>
              </CommandItem>
            ) : null}
            {models.length === 0 && !canUseTyped ? (
              <CommandEmpty>
                {loading ? "Loading models…" : "Type a model ID to use it."}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {models.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={`${model.id} ${model.name}`}
                    onSelect={() => pick(model.id)}
                    className="items-start"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-4",
                        model.id === value ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-near-ink">{model.name}</span>
                      {model.name !== model.id ? (
                        <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
                          {model.id}
                        </span>
                      ) : null}
                      <ModelChips model={model} />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Quiet warning shown under the field when the chosen model can't call tools. */
export function ToolCallingWarning({ model }: { model: ModelOption | undefined }) {
  if (!lacksToolCalling(model)) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs text-clay">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      This model does not support tool calling. Harly AI uses tools to read and update
      your pipeline, so it may not work well with it.
    </p>
  );
}
