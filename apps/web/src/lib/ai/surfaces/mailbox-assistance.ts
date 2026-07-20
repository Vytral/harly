import "server-only";

import { Output, generateText } from "ai";
import { z } from "zod";

import { getModel } from "@/lib/ai/registry";
import { recordAiUsage } from "@/lib/ai/usage";
import { UNTRUSTED_DATA_GUARDRAIL } from "@/lib/ai/prompts/guardrails";
import type { AiModelConfig } from "@/lib/ai/providers";

type MailMessageInput = {
  direction: "inbound" | "outbound";
  fromEmail: string;
  toEmails: string[];
  body: string;
  receivedAt: Date;
};

export type MailboxAssistanceInput = {
  subject: string;
  participantEmail: string | null;
  messages: MailMessageInput[];
};

const summarySchema = z.object({
  summary: z.string().trim().min(1).max(800),
  lastIntent: z.string().trim().min(1).max(500),
  nextStep: z.string().trim().min(1).max(500),
  openQuestions: z.array(z.string().trim().min(1).max(300)).max(8),
});

const replySchema = z.object({ body: z.string().trim().min(1).max(10_000) });

const SYSTEM_PROMPT =
  "You are a recruiting inbox assistant. Use only the email data provided. " +
  "Never invent facts, commitments, availability, or candidate details. Keep outputs concise and practical. " +
  UNTRUSTED_DATA_GUARDRAIL;

function transcript(input: MailboxAssistanceInput) {
  return [
    `Subject: ${input.subject}`,
    `Participant: ${input.participantEmail ?? "unknown"}`,
    "",
    ...input.messages.map(
      (message) =>
        `[${message.direction}] ${message.fromEmail} -> ${message.toEmails.join(", ")}\n${message.body.slice(0, 6_000)}`,
    ),
  ].join("\n\n").slice(0, 45_000);
}

export async function generateMailboxSummaryWithAI(
  config: AiModelConfig,
  input: MailboxAssistanceInput,
) {
  const result = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    prompt: `Summarize this recruiting email thread for a human recruiter. Return a short summary, the candidate's latest intent, one recommended next step, and unanswered questions.\n\n${transcript(input)}`,
    output: Output.object({ schema: summarySchema, name: "mailbox_thread_summary" }),
  });
  recordAiUsage({ surface: "mailbox_summary", provider: config.provider, modelId: config.modelId, promptTokens: result.usage.inputTokens ?? 0, completionTokens: result.usage.outputTokens ?? 0 });
  if (!result.output) throw new Error("AI returned no mailbox summary.");
  return result.output;
}

export async function generateMailboxReplyWithAI(
  config: AiModelConfig,
  input: MailboxAssistanceInput,
) {
  const result = await generateText({
    model: getModel(config),
    system: `${SYSTEM_PROMPT} Draft a plain-text reply for a recruiter to review. Do not send it. Do not claim a meeting is booked or make promises not present in the thread. Do not include a subject or greeting if it would be speculative; write a useful, editable body.`,
    prompt: `Draft a concise, professional reply to this email thread. Preserve the candidate's latest intent and ask only necessary follow-up questions.\n\n${transcript(input)}`,
    output: Output.object({ schema: replySchema, name: "mailbox_reply_draft" }),
  });
  recordAiUsage({ surface: "mailbox_reply", provider: config.provider, modelId: config.modelId, promptTokens: result.usage.inputTokens ?? 0, completionTokens: result.usage.outputTokens ?? 0 });
  if (!result.output) throw new Error("AI returned no mailbox reply.");
  return result.output;
}
