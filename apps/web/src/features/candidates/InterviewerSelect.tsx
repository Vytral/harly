"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, User } from "lucide-react";

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
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";

export type InterviewerOption = {
  userId: string;
  name: string;
  image: string | null;
};

export function InterviewerSelect({
  value,
  onChange,
  members,
  currentUserId,
  label = "Interviewer",
}: {
  value: string;
  onChange: (userId: string) => void;
  members: InterviewerOption[];
  currentUserId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected = members.find((m) => m.userId === value);

  const sorted = [...members].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-2">
      <label className="text-[13px] font-medium tracking-tight text-foreground/90">
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selected ? (
              <span className="flex items-center gap-2">
                <UserAvatar
                  name={selected.name}
                  src={selected.image}
                  size="sm"
                  className="size-5 text-[10px]"
                />
                <span className="truncate">
                  {selected.name}
                  {currentUserId && selected.userId === currentUserId ? (
                    <span className="ml-1 text-muted-foreground">(You)</span>
                  ) : null}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Unassigned</span>
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search people..." />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="unassigned"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <User className="size-5 text-muted-foreground" />
                  <span className="flex-1">Unassigned</span>
                  <Check
                    className={cn(
                      "size-4",
                      !value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
                {sorted.map((m) => (
                  <CommandItem
                    key={m.userId}
                    value={m.name}
                    onSelect={() => {
                      onChange(m.userId);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <UserAvatar
                      name={m.name}
                      src={m.image}
                      size="sm"
                      className="size-5 text-[10px]"
                    />
                    <span className="flex-1 truncate">
                      {m.name}
                      {currentUserId && m.userId === currentUserId ? (
                        <span className="ml-1 text-muted-foreground">(You)</span>
                      ) : null}
                    </span>
                    <Check
                      className={cn(
                        "size-4",
                        value === m.userId ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
