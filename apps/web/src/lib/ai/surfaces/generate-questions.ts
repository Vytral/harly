import "server-only";

import { Output, generateText } from "ai";
import { z } from "zod";

import { getModel } from "@/lib/ai/registry";
import type { AiModelConfig } from "@/lib/ai/providers";

export type SuggestedQuestion = {
  label: string;
  type: "text" | "textarea";
  placeholder: string;
};

export type QuestionsInput = {
  title: string;
  description?: string | null;
  keywords?: string[];
};

const suggestedQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      label: z.string(),
      type: z.enum(["text", "textarea"]),
      placeholder: z.string(),
    }),
  ),
});

const SYSTEM_PROMPT =
  "You are a senior recruiter designing application screening questions. " +
  "Return 4-5 concise, high-signal questions that help evaluate fit for the specific role. " +
  "Avoid generic questions like 'Why do you want to work here?' or 'Tell me about yourself'. " +
  "Focus on role-specific skills, experience signals, and concrete scenarios. " +
  "Use type 'text' for short answers (1-2 sentences), 'textarea' for longer responses. " +
  "placeholder should be a short example answer (under 12 words), not a restatement of the question.";

export async function generateScreeningQuestionsWithAI(
  config: AiModelConfig,
  input: QuestionsInput,
): Promise<SuggestedQuestion[]> {
  const facts = [
    `Role: ${input.title}`,
    input.keywords && input.keywords.length > 0
      ? `Key skills: ${input.keywords.slice(0, 10).join(", ")}`
      : null,
    input.description
      ? `Description excerpt: ${input.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { output } = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    prompt: `Generate screening questions for this role:\n\n${facts}`,
    output: Output.object({ schema: suggestedQuestionsSchema }),
  });

  if (!output) throw new Error("AI returned no questions.");

  return output.questions.slice(0, 5);
}
