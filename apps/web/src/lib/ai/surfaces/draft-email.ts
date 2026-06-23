import "server-only";

import { generateText } from "ai";

import { getModel } from "@/lib/ai/registry";
import type { AiModelConfig } from "@/lib/ai/providers";

export type EmailDraftType =
  | "screening"
  | "interview_invite"
  | "rejection"
  | "offer"
  | "followup";

export type EmailDraftInput = {
  type: EmailDraftType;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  stageName?: string | null;
  senderName?: string | null;
  /** Optional: include score context for more tailored rejections / strong invites. */
  aiScore?: number | null;
  aiRecommendation?: string | null;
};

export type EmailDraft = {
  subject: string;
  body: string;
};

const TYPE_INSTRUCTIONS: Record<EmailDraftType, string> = {
  screening: `Write a brief screening outreach to schedule an initial call. Tone: warm, professional, concise. 3-4 sentences. Ask for their availability this week or next.`,
  interview_invite: `Write an interview invitation. Tone: enthusiastic, professional. Mention the role, confirm next steps, and ask them to confirm a time. 4-5 sentences.`,
  rejection: `Write a respectful rejection. Tone: warm, empathetic, appreciative of their time. Do NOT use phrases like "we've decided to move forward with other candidates" verbatim — vary the language. 3-4 sentences. No false promises about future roles unless it genuinely fits.`,
  offer: `Write an offer congratulations email. Tone: excited, warm. Mention the role, express genuine enthusiasm about them joining. 4-5 sentences. Do NOT include salary figures — those belong in the formal offer letter.`,
  followup: `Write a friendly follow-up checking in on a previous conversation or pending next step. Tone: light, professional, no pressure. 3 sentences max.`,
};

const SYSTEM_PROMPT =
  "You are a thoughtful, senior recruiter who writes clear, human emails. " +
  "Never use buzzwords, clichés, or hollow phrases like 'excited to share', " +
  "'best-in-class', or 'fast-paced environment'. " +
  "Write as a real person would to another real person. " +
  "Return ONLY valid JSON: { \"subject\": string, \"body\": string }. " +
  "The body must use plain text with line breaks (\\n\\n between paragraphs). " +
  "Sign off with the sender's name on a new line. No HTML.";

export async function draftEmailWithAI(
  config: AiModelConfig,
  input: EmailDraftInput,
): Promise<EmailDraft> {
  const scoreContext =
    input.aiScore != null
      ? `\nAI fit score: ${input.aiScore}/100 (${input.aiRecommendation ?? "unknown recommendation"})`
      : "";

  const prompt =
    `Draft type: ${input.type}\n` +
    `Candidate: ${input.candidateName}\n` +
    `Role: ${input.jobTitle}\n` +
    `Company: ${input.companyName}\n` +
    (input.stageName ? `Current stage: ${input.stageName}\n` : "") +
    (input.senderName ? `Sender: ${input.senderName}\n` : "") +
    scoreContext +
    `\n\nInstruction: ${TYPE_INSTRUCTIONS[input.type]}`;

  const { text } = await generateText({
    model: getModel(config),
    system: SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: 512,
  });

  // Parse JSON — strip possible markdown fences
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  const parsed = JSON.parse(cleaned) as { subject: string; body: string };

  if (!parsed.subject || !parsed.body) {
    throw new Error("AI returned incomplete draft.");
  }

  return { subject: parsed.subject.trim(), body: parsed.body.trim() };
}
