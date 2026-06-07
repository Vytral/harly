"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import type { JobApplicationQuestion, JobQuestionType } from "./config";
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

type JobQuestionBuilderProps = {
  initialQuestions: JobApplicationQuestion[];
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

export function JobQuestionBuilder({
  initialQuestions,
}: JobQuestionBuilderProps) {
  const [questions, setQuestions] =
    useState<JobApplicationQuestion[]>(initialQuestions);
  const hiddenValue = useMemo(() => JSON.stringify(questions), [questions]);

  function updateQuestion(
    index: number,
    nextQuestion: Partial<JobApplicationQuestion>,
  ) {
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

  return (
    <div className="space-y-3">
      <input type="hidden" name="applicationQuestionsJson" value={hiddenValue} />

      {questions.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
          No custom questions. Candidates only see the default application
          fields.
        </p>
      ) : null}

      {questions.map((question, index) => (
        <div
          key={`${question.id}-${index}`}
          className="space-y-3 rounded-lg border bg-muted/30 p-4"
        >
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="space-y-2">
              <Label>Question label</Label>
              <Input
                value={question.label}
                onChange={(event) =>
                  updateQuestion(index, { label: event.target.value })
                }
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
                onChange={(event) =>
                  updateQuestion(index, { placeholder: event.target.value })
                }
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
                    minLength: event.target.value
                      ? Number(event.target.value)
                      : undefined,
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
                  updateQuestion(index, {
                    options: textToOptions(event.target.value),
                  })
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

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          setQuestions((current) => [
            ...current,
            createQuestion(current.length),
          ])
        }
      >
        <Plus className="size-4" />
        Add question
      </Button>
    </div>
  );
}
