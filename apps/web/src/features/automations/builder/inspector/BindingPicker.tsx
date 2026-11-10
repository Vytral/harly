"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";

import { bindingOptionsFor, describeBinding, type BindingOption } from "./bindings";
import type { Binding, WorkflowGraphV2 } from "../../definition/schema-v2";

export function BindingPicker({
  graph,
  nodeId,
  value,
  onChange,
  allowLiteral = true,
}: {
  graph: WorkflowGraphV2;
  nodeId: string;
  value: Binding | undefined;
  onChange: (binding: Binding | undefined) => void;
  allowLiteral?: boolean;
}) {
  const t = useTranslations("features.automations.BindingPicker");
  const tl = useTranslations("labels.automations");
  const options = useMemo(() => bindingOptionsFor(graph, nodeId, tl), [graph, nodeId, tl]);
  const usingData = value?.kind === "trigger" || value?.kind === "output";
  const [open, setOpen] = useState(false);
  const groups = [...new Set(options.map((item) => item.group))];

  return (
    <div className="space-y-1.5">
      {allowLiteral ? (
        <div className="flex gap-1">
          <ModeButton active={!usingData} onClick={() => {
            if (usingData) onChange({ kind: "literal", value: "" });
          }}>
            {t("typeValue")}
          </ModeButton>
        </div>
      ) : null}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
          <button
            type="button"
            className="min-h-9 w-full rounded-lg border border-border bg-pure-snow px-2.5 text-left text-xs text-foreground focus-visible:outline-2"
          >
            {usingData ? describeBinding(value, graph, tl) : t("useDataFromStep")}
          </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[320px] max-w-[calc(100vw-24px)] p-0">
            <Command>
              <CommandInput placeholder={t("searchPlaceholder")} />
              <CommandList>
              <CommandEmpty>{t("noData")}</CommandEmpty>
              {groups.map((group) => (
                <CommandGroup key={group} heading={tl(`bindings.groups.${group}`)}>
                  {options
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <BindingRow
                        key={item.id}
                        option={item}
                        t={t}
                        onPick={() => {
                          if (item.disabled) return;
                          onChange(item.binding);
                          setOpen(false);
                        }}
                      />
                    ))}
                </CommandGroup>
              ))}
              </CommandList>
            </Command>
            <p className="border-t border-border px-3 py-2 text-[11px] text-soft-ink">{t("resolvedAtRun")}</p>
          </PopoverContent>
        </Popover>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 text-[11px] font-medium",
        active ? "bg-soft-kraft text-foreground" : "text-soft-ink hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function BindingRow({
  option,
  onPick,
  t,
}: {
  option: BindingOption;
  onPick: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <CommandItem
      value={`${option.label} ${option.origin}`}
      disabled={option.disabled}
      onSelect={onPick}
      className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-soft-kraft/60 disabled:opacity-40"
      title={option.reason}
    >
      <span className="text-xs font-medium text-foreground">{option.label}</span>
      <span className="text-[10px] text-soft-ink">
        {option.reason
          ? t("exampleOriginReason", { origin: option.origin, example: option.example, reason: option.reason })
          : t("exampleOrigin", { origin: option.origin, example: option.example })}
      </span>
    </CommandItem>
  );
}
