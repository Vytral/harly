"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import type { JobApplicationQuestion, JobQuestionType } from "./config";
import { generateScreeningQuestionsAction } from "./actions";
import { AiButton } from "@/components/ui/AiButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type SuggestedQuestion = {
  label: string;
  type: "text" | "textarea";
  placeholder: string;
};

type JobQuestionBuilderProps = {
  initialQuestions: JobApplicationQuestion[];
  aiContext?: {
    title: string;
    description: string;
    keywords: string[];
  };
};

const questionTypes: Array<{ value: JobQuestionType; label: string }> = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "url", label: "URL" },
  { value: "select", label: "Select" },
];

function createQuestion(index: number): JobApplicationQuestion {
  return {
    id: `question-${index + 1}`,
    label: "",
    type: "text",
    required: false,
    placeholder: "",
  };
}

function optionsToText(options: readonly string[] | undefined) {
  return options?.join("\n") ?? "";
}

function textToOptions(value: string) {
  return value
    .split("\n")
    .map((option) => option.trim())
    .filter(Boolean);
}

export function JobQuestionBuilder({ initialQuestions, aiContext }: JobQuestionBuilderProps) {
  const router = useRouter();
  const [questions, setQuestions] = useState<JobApplicationQuestion[]>(initialQuestions);
  const [suggestions, setSuggestions] = useState<SuggestedQuestion[]>([]);
  const [isGenerating, startGenerate] = useTransition();
  const hiddenValue = useMemo(() => JSON.stringify(questions), [questions]);

  function updateQuestion(index: number, nextQuestion: Partial<JobApplicationQuestion>) {
    setQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...nextQuestion } : question,
      ),
    );
  }

  function removeQuestion(index: number) {
    setQuestions((current) =>
      current.filter((_, questionIndex) => questionIndex !== index),
    );
  }

  function addSuggestion(suggestion: SuggestedQuestion) {
    setQuestions((current) => [
      ...current,
      {
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: suggestion.label,
        type: suggestion.type,
        required: false,
        placeholder: suggestion.placeholder,
      },
    ]);
    setSuggestions((current) => current.filter((s) => s.label !== suggestion.label));
  }

  function addAllSuggestions() {
    const toAdd = suggestions.filter(
      (s) => !questions.some((q) => q.label === s.label),
    );
    setQuestions((current) => [
      ...current,
      ...toAdd.map((s) => ({
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: s.label,
        type: s.type,
        required: false,
        placeholder: s.placeholder,
      })),
    ]);
    setSuggestions([]);
  }

  function generateWithAI() {
    if (!aiContext?.title?.trim()) {
      toast.error("Add a job title first.");
      return;
    }
    startGenerate(async () => {
      const result = await generateScreeningQuestionsAction({
        title: aiContext.title,
        description: aiContext.description || null,
        keywords: aiContext.keywords,
      });
      if (!result.ok) {
        if (result.reason === "not_configured") {
          toast.error(result.error, {
            action: { label: "Set up AI", onClick: () => router.push("/settings/ai") },
          });
        } else {
          toast.error(result.error);
        }
        return;
      }
      const fresh = result.questions.filter(
        (s) => !questions.some((q) => q.label === s.label),
      );
      setSuggestions(fresh);
      if (fresh.length === 0) toast.message("All suggested questions already added.");
    });
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="applicationQuestionsJson" value={hiddenValue} />

      {/* AI suggestions panel */}
      {suggestions.length > 0 ? (
        <div
          className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2.5"
          style={{ animation: "fadeUp 200ms cubic-bezier(0.23,1,0.32,1) both" }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-primary/70">
              AI suggestions, click to add
            </p>
            <button
              type="button"
              onClick={addAllSuggestions}
              className="text-[12px] font-medium text-primary underline-offset-2 hover:underline"
            >
              Add all
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {suggestions.map((s, i) => (
              <button
                key={s.label}
                type="button"
                onClick={() => addSuggestion(s)}
                style={{
                  animation: `fadeUp 180ms cubic-bezier(0.23,1,0.32,1) ${i * 35}ms both`,
                }}
                className={cn(
                  "group flex w-full items-start gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-left",
                  "transition-all duration-150 hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]",
                )}
              >
                <Plus className="mt-0.5 size-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">{s.label}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.placeholder}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {questions.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
          No custom questions. Candidates only see the default application fields.
        </p>
      ) : null}

      {questions.map((question, index) => (
        <div key={`${question.id}-${index}`} className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="space-y-2">
              <Label>Question label</Label>
              <Input
                value={question.label}
                onChange={(event) => updateQuestion(index, { label: event.target.value })}
                placeholder="What makes you a strong fit?"
                className="bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={question.type}
                onValueChange={(value) =>
                  updateQuestion(index, { type: value as JobQuestionType })
                }
              >
                <SelectTrigger className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {questionTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Placeholder</Label>
              <Input
                value={question.placeholder ?? ""}
                onChange={(event) => updateQuestion(index, { placeholder: event.target.value })}
                placeholder="Optional helper text"
                className="bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label>Minimum characters</Label>
              <Input
                value={question.minLength ?? ""}
                onChange={(event) =>
                  updateQuestion(index, {
                    minLength: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
                type="number"
                min="0"
                className="bg-card"
              />
            </div>
          </div>

          {question.type === "select" ? (
            <div className="space-y-2">
              <Label>Options</Label>
              <Textarea
                value={optionsToText(question.options)}
                onChange={(event) =>
                  updateQuestion(index, { options: textToOptions(event.target.value) })
                }
                rows={4}
                placeholder={"One option per line\nRemote\nHybrid\nOn-site"}
                className="bg-card"
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={question.required}
                onCheckedChange={(checked) =>
                  updateQuestion(index, { required: checked === true })
                }
              />
              Required
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => removeQuestion(index)}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setQuestions((current) => [...current, createQuestion(current.length)])
          }
        >
          <Plus className="size-4" />
          Add question
        </Button>
        {aiContext ? (
          <AiButton
            type="button"
            size="sm"
            variant="ghost"
            onClick={generateWithAI}
            loading={isGenerating}
            loadingText="Suggesting"
          >
            Suggest with AI
          </AiButton>
        ) : null}
      </div>
    </div>
  );
}
