/**
 * The guided first hour, as a pure model. Completion is derived from real
 * workspace data (see ChecklistFacts), never from clicks, so the checklist can
 * not claim progress that the database does not show. Persistence and queries
 * live in setup-checklist.ts and checklist-state.ts; this module has no I/O.
 */

export const CHECKLIST_ITEM_KEYS = [
  "invite_teammate",
  "create_job",
  "publish_job",
  "pipeline_candidates",
  "connect_email",
  "connect_calendar",
  "automate_workflow",
] as const;

export type ChecklistItemKey = (typeof CHECKLIST_ITEM_KEYS)[number];

/** Counts of real (non-sample) workspace records and integration flags. */
export type ChecklistFacts = {
  /** Non-deleted jobs that are not tracked sample data. */
  jobCount: number;
  /** Of those, the jobs currently open (published). */
  publishedJobCount: number;
  /** Applications that are not tracked sample data. */
  applicationCount: number;
  emailConnected: boolean;
  calendarConnected: boolean;
  /** Workflow definitions of any status. */
  automationCount: number;
  /** A second member exists, or an invitation is outstanding. */
  teammateInvited: boolean;
};

export type ChecklistPreferences = {
  dismissed: boolean;
  skipped: ChecklistItemKey[];
};

export type ChecklistRow = {
  key: ChecklistItemKey;
  title: string;
  value: string;
  href: string;
  done: boolean;
  skipped: boolean;
  optional: boolean;
  ctaLabel: string;
};

export type SetupChecklistModel = {
  items: ChecklistRow[];
  /** First row that is neither done nor skipped; powers the "Next" hint. */
  nextStep: ChecklistRow | null;
  completed: number;
  total: number;
  percent: number;
  allDone: boolean;
  dismissed: boolean;
  /** Owner or admin only; recruiters never see the checklist. */
  visible: boolean;
  /** Whether the dashboard should render the checklist card at all. */
  showCard: boolean;
};

type ItemDefinition = {
  key: ChecklistItemKey;
  title: string;
  value: string;
  href: string;
  /** Only optional steps can be skipped; required steps stay until done. */
  optional: boolean;
  done: (facts: ChecklistFacts) => boolean;
};

export const CHECKLIST_DEFINITIONS: readonly ItemDefinition[] = [
  {
    key: "invite_teammate",
    title: "Invite a teammate",
    value: "Hiring goes faster with a second pair of eyes on every candidate.",
    href: "/settings/members",
    optional: true,
    done: (facts) => facts.teammateInvited,
  },
  {
    key: "create_job",
    title: "Create your first job",
    value: "Describe the role once, then share it from your careers page.",
    href: "/dashboard/jobs/new",
    optional: false,
    done: (facts) => facts.jobCount > 0,
  },
  {
    key: "publish_job",
    title: "Publish it",
    value: "A published job appears on your careers page and takes applications.",
    href: "/dashboard/jobs",
    optional: false,
    done: (facts) => facts.publishedJobCount > 0,
  },
  {
    key: "pipeline_candidates",
    title: "Get candidates into the pipeline",
    value: "Load sample data to explore, share your job link, or import a CSV.",
    href: "/dashboard/candidates",
    optional: false,
    done: (facts) => facts.applicationCount > 0,
  },
  {
    key: "connect_email",
    title: "Connect email",
    value: "Send and track candidate emails from one inbox.",
    href: "/settings/integrations",
    optional: false,
    done: (facts) => facts.emailConnected,
  },
  {
    key: "connect_calendar",
    title: "Connect a calendar",
    value: "Let candidates book interviews without the back-and-forth.",
    href: "/settings/integrations",
    optional: true,
    done: (facts) => facts.calendarConnected,
  },
  {
    key: "automate_workflow",
    title: "Automate a workflow",
    value: "Start from one of ten recipes for tagging, alerts and stage moves.",
    href: "/dashboard/automations",
    optional: true,
    done: (facts) => facts.automationCount > 0,
  },
];

const KNOWN_KEYS = new Set<string>(CHECKLIST_ITEM_KEYS);
const OPTIONAL_KEYS = new Set<string>(
  CHECKLIST_DEFINITIONS.filter((item) => item.optional).map((item) => item.key),
);

export const NO_CHECKLIST_PREFERENCES: ChecklistPreferences = {
  dismissed: false,
  skipped: [],
};

/**
 * Keep only keys that are still real, optional checklist steps. Stored values
 * can outlive a renamed or removed step, and a required step can never be
 * skipped, so both are dropped here instead of trusted.
 */
export function normalizeSkippedKeys(raw: unknown): ChecklistItemKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ChecklistItemKey>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    if (!KNOWN_KEYS.has(value) || !OPTIONAL_KEYS.has(value)) continue;
    seen.add(value as ChecklistItemKey);
  }
  return [...seen];
}

export function isSkippableChecklistKey(key: string): key is ChecklistItemKey {
  return OPTIONAL_KEYS.has(key);
}

export type ChecklistAction =
  | { type: "dismiss" }
  /** Restoring brings every step back, including ones the user skipped. */
  | { type: "restore" }
  | { type: "skip"; key: string };

export type ChecklistTransition =
  | { ok: true; preferences: ChecklistPreferences }
  | { ok: false; error: string };

export function applyChecklistAction(
  current: ChecklistPreferences,
  action: ChecklistAction,
): ChecklistTransition {
  switch (action.type) {
    case "dismiss":
      return { ok: true, preferences: { ...current, dismissed: true } };
    case "restore":
      return { ok: true, preferences: NO_CHECKLIST_PREFERENCES };
    case "skip": {
      if (!isSkippableChecklistKey(action.key)) {
        return { ok: false, error: "That step cannot be skipped." };
      }
      const skipped = Array.from(new Set([...current.skipped, action.key]));
      return { ok: true, preferences: { ...current, skipped } };
    }
  }
}

/** Derive every row, the next step and the card visibility from facts. */
export function buildSetupChecklist(input: {
  facts: ChecklistFacts;
  preferences: ChecklistPreferences;
  canManage: boolean;
}): SetupChecklistModel {
  const skipped = new Set<string>(
    normalizeSkippedKeys(input.preferences.skipped),
  );

  const items: ChecklistRow[] = CHECKLIST_DEFINITIONS.map((definition) => {
    const done = definition.done(input.facts);
    return {
      key: definition.key,
      title: definition.title,
      value: definition.value,
      href: definition.href,
      done,
      skipped: !done && skipped.has(definition.key),
      optional: definition.optional,
      ctaLabel: done ? "Open" : "Start",
    };
  });

  const total = items.length;
  const completed = items.filter((item) => item.done).length;
  const nextStep = items.find((item) => !item.done && !item.skipped) ?? null;
  const allDone = completed === total;
  const dismissed = input.preferences.dismissed;
  const visible = input.canManage;

  return {
    items,
    nextStep,
    completed,
    total,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100),
    allDone,
    dismissed,
    visible,
    showCard: visible && !dismissed && nextStep !== null,
  };
}
