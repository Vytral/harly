/**
 * The guided first hour, as a pure model. Completion is derived from real
 * workspace data (see ChecklistFacts), never from clicks, so the checklist can
 * not claim progress that the database does not show. Persistence and queries
 * live in setup-checklist.ts and checklist-state.ts; this module has no I/O.
 */

export const CHECKLIST_ITEM_KEYS = [
  "create_job",
  "publish_job",
  "pipeline_candidates",
  "invite_teammate",
  "connect_email",
  "connect_calendar",
  "connect_ai",
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
  /** An AI provider is enabled, keyed and decryptable for this workspace. */
  aiConfigured: boolean;
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

/** Translates a key under `labels.onboarding.checklist`. */
export type ChecklistTranslate = (key: string) => string;

type ItemDefinition = {
  key: ChecklistItemKey;
  /** Stem of the `<stem>.title` and `<stem>.value` catalog keys. */
  messageKey: string;
  href: string;
  /** Only optional steps can be skipped; required steps stay until done. */
  optional: boolean;
  done: (facts: ChecklistFacts) => boolean;
};

export const CHECKLIST_DEFINITIONS: readonly ItemDefinition[] = [
  {
    key: "create_job",
    messageKey: "createJob",
    href: "/dashboard/jobs/new",
    optional: false,
    done: (facts) => facts.jobCount > 0,
  },
  {
    key: "publish_job",
    messageKey: "publishJob",
    href: "/dashboard/jobs",
    optional: false,
    done: (facts) => facts.publishedJobCount > 0,
  },
  {
    key: "pipeline_candidates",
    messageKey: "pipelineCandidates",
    href: "/dashboard/candidates",
    optional: false,
    done: (facts) => facts.applicationCount > 0,
  },
  {
    key: "invite_teammate",
    messageKey: "inviteTeammate",
    href: "/settings/members",
    optional: true,
    done: (facts) => facts.teammateInvited,
  },
  {
    key: "connect_email",
    messageKey: "connectEmail",
    href: "/settings/integrations",
    optional: false,
    done: (facts) => facts.emailConnected,
  },
  {
    key: "connect_calendar",
    messageKey: "connectCalendar",
    href: "/settings/integrations",
    optional: true,
    done: (facts) => facts.calendarConnected,
  },
  {
    key: "connect_ai",
    messageKey: "connectAi",
    href: "/settings/ai",
    optional: true,
    done: (facts) => facts.aiConfigured,
  },
  {
    key: "automate_workflow",
    messageKey: "automateWorkflow",
    href: "/dashboard/automations?recipes=1",
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

/** `error` is a stable code the caller translates. */
export type ChecklistTransition =
  | { ok: true; preferences: ChecklistPreferences }
  | { ok: false; error: "not_skippable" };

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
        return { ok: false, error: "not_skippable" };
      }
      const skipped = Array.from(new Set([...current.skipped, action.key]));
      return { ok: true, preferences: { ...current, skipped } };
    }
  }
}

/**
 * Which setup reads a dashboard render needs for this viewer. The checklist card
 * is for owners and admins, so other roles skip its queries. The sample banner
 * is shown to the whole team and needs only the sample status. Demo mode shows
 * neither.
 */
export function setupReadsFor(input: { demo: boolean; canManage: boolean }): {
  checklist: boolean;
  sampleStatus: boolean;
} {
  if (input.demo) return { checklist: false, sampleStatus: false };
  return input.canManage
    ? { checklist: true, sampleStatus: false }
    : { checklist: false, sampleStatus: true };
}

/** Derive every row, the next step and the card visibility from facts. */
export function buildSetupChecklist(input: {
  facts: ChecklistFacts;
  preferences: ChecklistPreferences;
  canManage: boolean;
  t: ChecklistTranslate;
}): SetupChecklistModel {
  const skipped = new Set<string>(
    normalizeSkippedKeys(input.preferences.skipped),
  );

  const items: ChecklistRow[] = CHECKLIST_DEFINITIONS.map((definition) => {
    const done = definition.done(input.facts);
    return {
      key: definition.key,
      title: input.t(`${definition.messageKey}.title`),
      value: input.t(`${definition.messageKey}.value`),
      href: definition.href,
      done,
      skipped: !done && skipped.has(definition.key),
      optional: definition.optional,
      ctaLabel: done ? input.t("open") : input.t("start"),
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
