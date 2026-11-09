/**
 * Starter workflow templates — full `WorkflowDefinitionInput` values a recruiter
 * can spin up in one click from the empty state or the "New from template"
 * picker. Each is a complete WHEN → IF → DO definition, valid against the Zod
 * schemas in `./schema`.
 *
 * Templates are intentionally generic: stage names ("Phone screen", "Offer")
 * and tag labels are placeholders the user edits after creating. They showcase
 * the shape of each construct (trigger, condition tree, action list) without
 * referencing real record ids.
 *
 * Gallery copy (name, description, category) is translated with
 * `templateCopy`. The name and description inside `build()` are saved with the
 * workflow as data, so they stay in English, as do the message bodies.
 */

import type { WorkflowDefinitionInput } from "../schema";
import type { BuilderT } from "./catalog";

export type WorkflowTemplateCategory = "Pipeline" | "Notification" | "Triage" | "Onboarding";

export type WorkflowTemplate = {
  id: string;
  /** Emoji-free category tag for the gallery. */
  category: WorkflowTemplateCategory;
  build: () => WorkflowDefinitionInput;
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "notify-slack-on-apply",
    category: "Notification",
    build: () => ({
      name: "Notify chat on new application",
      description: "Posts to the workspace chat channel when a candidate applies.",
      enabled: true,
      trigger: { event: "application.created" },
      conditions: [],
      actions: [
        {
          type: "send_slack",
          config: { message: "New application received for {{job_title}} — {{candidate_full_name}}." },
          continueOnError: true,
        },
      ],
    }),
  },
  {
    id: "auto-reject-juniors",
    category: "Triage",
    build: () => ({
      name: "Auto-reject under-qualified applicants",
      description: "Rejects junior-role applicants with a low AI match score.",
      enabled: false,
      trigger: { event: "application.created" },
      conditions: [
        {
          type: "and",
          children: [
            { type: "leaf", field: { kind: "job", path: "seniority" }, op: "eq", value: "junior" },
            { type: "leaf", field: { kind: "ai", path: "score" }, op: "lt", value: 40 },
          ],
        },
      ],
      actions: [
        {
          type: "set_status",
          config: { status: "rejected" },
          continueOnError: false,
        },
        {
          type: "add_tag",
          config: { label: "auto-rejected" },
          continueOnError: true,
        },
      ],
    }),
  },
  {
    id: "screening-task-on-stage",
    category: "Pipeline",
    build: () => ({
      name: "Create screening task on stage change",
      description: "Assigns a phone-screen task when an application reaches the Phone screen stage.",
      enabled: true,
      trigger: { event: "application.stage_changed" },
      conditions: [
        { type: "leaf", field: { kind: "trigger", path: "toStageName" }, op: "eq", value: "Phone screen" },
      ],
      actions: [
        {
          type: "create_task",
          config: { title: "Phone screen candidate", priority: "high" },
          continueOnError: false,
        },
      ],
    }),
  },
  {
    id: "tag-vip-candidates",
    category: "Triage",
    build: () => ({
      name: "Tag high-fit candidates",
      description: "Tags strong applicants as 'vip' based on AI score.",
      enabled: true,
      trigger: { event: "application.created" },
      conditions: [
        { type: "leaf", field: { kind: "ai", path: "score" }, op: "gte", value: 80 },
      ],
      actions: [
        {
          type: "add_tag",
          config: { label: "vip" },
          continueOnError: true,
        },
        {
          type: "send_slack",
          config: { message: "High-fit candidate applied: {{candidate_full_name}} for {{job_title}}." },
          continueOnError: true,
        },
      ],
    }),
  },
  {
    id: "note-on-reject",
    category: "Pipeline",
    build: () => ({
      name: "Log a note on rejection",
      description: "Adds a timestamped note when an application is rejected.",
      enabled: true,
      trigger: { event: "application.rejected" },
      conditions: [],
      actions: [
        {
          type: "add_note",
          config: { body: "Application rejected. Review the stage history for context." },
          continueOnError: true,
        },
      ],
    }),
  },
  {
    id: "interview-prep-task",
    category: "Onboarding",
    build: () => ({
      name: "Prep task on interview scheduled",
      description: "Creates an interview-prep task when an interview is booked.",
      enabled: true,
      trigger: { event: "interview.scheduled" },
      conditions: [],
      actions: [
        {
          type: "create_task",
          config: { title: "Prepare for upcoming interview", priority: "medium" },
          continueOnError: false,
        },
      ],
    }),
  },
  {
    id: "notify-hire",
    category: "Notification",
    build: () => ({
      name: "Celebrate hires in chat",
      description: "Posts to the team channel when an application is marked hired.",
      enabled: true,
      trigger: { event: "application.hired" },
      conditions: [],
      actions: [
        {
          type: "send_slack",
          config: { message: "{{candidate_full_name}} accepted — welcome aboard!" },
          continueOnError: true,
        },
      ],
    }),
  },
  {
    id: "tag-new-candidate",
    category: "Triage",
    build: () => ({
      name: "Tag new candidates by source",
      description: "Adds a 'new' tag to every freshly created candidate.",
      enabled: false,
      trigger: { event: "candidate.created" },
      conditions: [],
      actions: [
        {
          type: "add_tag",
          config: { label: "new" },
          continueOnError: true,
        },
      ],
    }),
  },
];

/** Translation key stem for a template: `notify-slack-on-apply` → `notifySlackOnApply`. */
function templateKey(id: string): string {
  return id.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

/** Translated gallery copy for a template. */
export function templateCopy(template: WorkflowTemplate, t: BuilderT): {
  name: string;
  description: string;
  category: string;
} {
  const key = `templates.items.${templateKey(template.id)}`;
  return {
    name: t(`${key}.name`),
    description: t(`${key}.description`),
    category: t(`templates.categories.${template.category.toLowerCase()}`),
  };
}

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}
