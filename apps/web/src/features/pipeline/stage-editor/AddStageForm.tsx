"use client";

import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { StageKind } from "@harly/db/stage-kind";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  KIND_OPTIONS,
  checkStageName,
  nameErrorMessage,
  positionOptions,
  type EditorStage,
} from "./model";

/**
 * Adds a stage. The position list only offers slots that keep active stages
 * before outcome stages, and defaults to the slot just before the outcomes.
 */
export function AddStageForm({
  stages,
  busy,
  onCreate,
}: {
  stages: readonly EditorStage[];
  busy: boolean;
  onCreate: (input: { name: string; kind: StageKind; position: number }) => Promise<boolean>;
}) {
  const ids = useId();
  const t = useTranslations("features.pipeline.AddStageForm");
  const labels = useTranslations("labels.pipeline.stageEditor");
  const kindNames = useTranslations("labels.pipeline.stageKinds");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<StageKind>("custom");
  const [chosenPosition, setChosenPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = stages.filter((stage) => !stage.archivedAt);
  const slots = positionOptions(active, kind, labels);
  const position: number =
    chosenPosition !== null && slots.options.some((option) => option.value === chosenPosition)
      ? chosenPosition
      : slots.defaultValue;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const check = checkStageName(name, active);
    if (!check.ok) {
      setError(nameErrorMessage(check, labels));
      return;
    }
    setError(null);
    const created = await onCreate({ name: check.name, kind, position });
    if (created) {
      setName("");
      setChosenPosition(null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-[var(--radius-inner)] bg-card-inset p-4" noValidate>
      <div>
        <h3 className="text-sm font-medium text-foreground">{t("heading")}</h3>
        <p className="text-xs text-muted-foreground">{t("helper")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${ids}-name`}>{t("stageName")}</Label>
          <Input
            id={`${ids}-name`}
            value={name}
            maxLength={200}
            disabled={busy}
            placeholder={t("namePlaceholder")}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${ids}-error` : `${ids}-kind-help`}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
          {error ? (
            <p id={`${ids}-error`} role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-kind`}>{t("kind")}</Label>
          <Select
            value={kind}
            disabled={busy}
            onValueChange={(value) => {
              setKind(value as StageKind);
              setChosenPosition(null);
            }}
          >
            <SelectTrigger id={`${ids}-kind`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {kindNames(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id={`${ids}-kind-help`} className="text-xs leading-5 text-muted-foreground">
            {labels(`kindDescriptions.${kind}`)}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-position`}>{t("position")}</Label>
          <Select
            value={String(position)}
            disabled={busy}
            onValueChange={(value) => setChosenPosition(Number(value))}
          >
            <SelectTrigger id={`${ids}-position`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {slots.options.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy || name.trim() === ""}>
          <Plus className="size-4" aria-hidden="true" />
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
