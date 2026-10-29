"use client";

import { useState, type KeyboardEvent } from "react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import type { StageKind } from "@harly/db/stage-kind";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  MoreHorizontal,
  Trash2,
  Archive,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { duration, easing, useMotionSafe } from "@/lib/motion";
import { cn } from "@/lib/utils";

import {
  KIND_DESCRIPTIONS,
  KIND_OPTIONS,
  OUTCOME_EXPLANATIONS,
  STAGE_SWATCHES,
  countLabel,
  isOutcomeKind,
  kindLockNote,
  type EditorStage,
  type KindDecision,
  type NameCheck,
} from "./model";

type StageRowProps = {
  stage: EditorStage;
  /** 1-based position among active stages, for accessible labels. */
  position: number;
  total: number;
  busy: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  checkName: (name: string) => NameCheck;
  decideKind: (kind: StageKind) => KindDecision;
  onMoveStep: (direction: -1 | 1) => void;
  onRename: (name: string) => void;
  onRecolor: (color: string | null) => void;
  onChangeKind: (kind: StageKind) => void;
  onToggleEmail: (enabled: boolean) => void;
  onArchive: () => void;
  onDelete: () => void;
};

/**
 * One active stage in the editor. Sortable for drag and drop; the handle is
 * keyboard operable (dnd-kit sensor) and the arrow buttons cover touch and
 * keyboard users who do not want to drag.
 */
export function StageRow({
  stage,
  position,
  total,
  busy,
  canMoveUp,
  canMoveDown,
  checkName,
  decideKind,
  onMoveStep,
  onRename,
  onRecolor,
  onChangeKind,
  onToggleEmail,
  onArchive,
  onDelete,
}: StageRowProps) {
  const motionSafe = useMotionSafe();
  const sortable = useSortable({ id: stage.id, disabled: busy });
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, isDragging } =
    sortable;

  // A draft is what the user typed (or the name they just submitted). It is
  // shown only while the stage still has the name it had when the draft began,
  // so once the server answers, the stored name takes over without an effect.
  const [draft, setDraft] = useState<{ value: string; base: string } | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const shownName = draft && draft.base === stage.name ? draft.value : stage.name;
  const editingName = draft !== null && draft.base === stage.name;

  const lockNote = kindLockNote(stage);
  const hasCandidates = stage.applicationCount > 0;
  const nameInputId = `stage-name-${stage.id}`;
  const emailId = `stage-email-${stage.id}`;

  function commitName() {
    if (!editingName || busy) return;
    const check = checkName(shownName);
    if (!check.ok) {
      setNameError(check.error);
      return;
    }
    setNameError(null);
    if (check.name === stage.name) {
      setDraft(null);
      return;
    }
    setDraft({ value: check.name, base: stage.name });
    onRename(check.name);
  }

  function handleNameKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitName();
    } else if (event.key === "Escape" && editingName) {
      // Escape reverts an edit; the sheet keeps its own Escape for closing.
      event.preventDefault();
      setDraft(null);
      setNameError(null);
    }
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: motionSafe.reduce
      ? undefined
      : `transform ${duration.fast}s cubic-bezier(${easing.easeOut.join(", ")})`,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border bg-card p-3",
        isDragging && "relative z-10 shadow-md ring-1 ring-ring/30",
      )}
    >
      <div className="flex items-center gap-2">
        <Button
          ref={setActivatorNodeRef}
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
          disabled={busy}
          aria-label={`Drag to reorder ${stage.name}. Or use the arrow buttons. Position ${position} of ${total}.`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={busy}
              aria-label={`Colour for ${stage.name}`}
              className="size-6 shrink-0 rounded-full border border-hairline transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
              style={{ backgroundColor: stage.color ?? "transparent" }}
            >
              {stage.color ? null : <span className="sr-only">No colour</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">Stage colour</p>
            <div className="grid grid-cols-4 gap-2">
              {STAGE_SWATCHES.map((swatch) => {
                const selected = stage.color === swatch.value;
                return (
                  <button
                    key={swatch.value}
                    type="button"
                    aria-label={swatch.label}
                    aria-pressed={selected}
                    onClick={() => onRecolor(swatch.value)}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border border-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "ring-2 ring-ring",
                    )}
                    style={{ backgroundColor: swatch.value }}
                  >
                    {selected ? <Check className="size-3.5 text-foreground" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 w-full justify-start"
              onClick={() => onRecolor(null)}
            >
              No colour
            </Button>
          </PopoverContent>
        </Popover>

        <div className="min-w-0 flex-1">
          <Label htmlFor={nameInputId} className="sr-only">
            Stage name
          </Label>
          <Input
            id={nameInputId}
            value={shownName}
            maxLength={200}
            disabled={busy}
            data-name-editing={editingName ? "true" : undefined}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${nameInputId}-error` : undefined}
            onChange={(event) => {
              setDraft({ value: event.target.value, base: stage.name });
              setNameError(null);
            }}
            onBlur={commitName}
            onKeyDown={handleNameKey}
            className="h-8 font-medium"
          />
        </div>

        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={busy || !canMoveUp}
            onClick={() => onMoveStep(-1)}
            aria-label={`Move ${stage.name} up`}
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={busy || !canMoveDown}
            onClick={() => onMoveStep(1)}
            aria-label={`Move ${stage.name} down`}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              disabled={busy}
              aria-label={`More actions for ${stage.name}`}
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onArchive}>
              <Archive className="size-4" aria-hidden="true" />
              Archive…
            </DropdownMenuItem>
            {hasCandidates ? null : (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Delete stage
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {nameError ? (
        <p id={`${nameInputId}-error`} role="alert" className="mt-1.5 pl-[4.5rem] text-xs text-destructive">
          {nameError}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[4.5rem]">
        <Select
          value={stage.kind}
          disabled={busy}
          onValueChange={(value) => onChangeKind(value as StageKind)}
        >
          <SelectTrigger size="sm" className="w-36" aria-label={`Kind of ${stage.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((option) => {
              const decision = decideKind(option.value);
              const disabled = !decision.allowed && option.value !== stage.kind;
              return (
                <SelectItem key={option.value} value={option.value} disabled={disabled}>
                  {option.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <StatusPill size="sm" tone={hasCandidates ? "info" : "neutral"}>
          {countLabel(stage.applicationCount)}
        </StatusPill>

        <div className="flex items-center gap-2">
          <Switch
            id={emailId}
            checked={stage.emailConfig.candidateUpdatesEnabled}
            disabled={busy}
            onCheckedChange={onToggleEmail}
            aria-label={`Email candidates when they reach ${stage.name}`}
          />
          <Label htmlFor={emailId} className="text-xs font-normal text-muted-foreground">
            Email candidates
          </Label>
        </div>

      </div>

      <div className="mt-1.5 space-y-1 pl-[4.5rem] text-xs leading-5 text-muted-foreground">
        <p>
          {isOutcomeKind(stage.kind)
            ? OUTCOME_EXPLANATIONS[stage.kind]
            : KIND_DESCRIPTIONS[stage.kind]}
        </p>
        {lockNote ? <p>{lockNote}</p> : null}
      </div>
    </li>
  );
}
