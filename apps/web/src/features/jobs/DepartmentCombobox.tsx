"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DepartmentComboboxProps = {
  name: string;
  departments: string[];
  defaultValue?: string | null;
  className?: string;
};

/**
 * Select an existing department or create a new one inline. The chosen value is
 * written to a hidden input so the existing server action stays unchanged.
 */
export function DepartmentCombobox({
  name,
  departments,
  defaultValue,
  className,
}: DepartmentComboboxProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const exactExists = departments.some(
    (d) => d.toLowerCase() === trimmed.toLowerCase(),
  );

  function choose(next: string) {
    setValue(next);
    setQuery("");
    setOpen(false);
  }

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("h-10 w-full justify-between rounded-lg bg-card px-3.5 font-normal", className)}
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value || "Select or create a department"}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command>
            <CommandInput
              placeholder="Search or create…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
                Type a name to create a department.
              </CommandEmpty>
              {departments.length > 0 ? (
                <CommandGroup heading="Existing">
                  {departments.map((d) => (
                    <CommandItem key={d} value={d} onSelect={() => choose(d)}>
                      <Check
                        className={cn(
                          "size-4",
                          value === d ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {d}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {trimmed && !exactExists ? (
                <CommandGroup heading="Create new">
                  <CommandItem value={trimmed} onSelect={() => choose(trimmed)}>
                    <Plus className="size-4" />
                    Create &ldquo;{trimmed}&rdquo;
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
