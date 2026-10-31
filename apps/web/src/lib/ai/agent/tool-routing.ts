import "server-only";

import type { HarlyIntent } from "./intent";
import { AGENT_WRITE_TOOLS } from "./write-tool-names";
import type { HarlyToolContext } from "./tools";

/**
 * Functional groups covering every Harly AI tool (read + write). Every real
 * tool name must appear in exactly one group's `tools` array; this is
 * enforced by `assertToolRoutingCoversAllTools` and its dedicated test so a
 * newly added tool can never silently fall outside the routing gateway
 * (Phase 6, AI10).
 *
 * Groups mirror the thematic sections already used by
 * `AGENT_READ_TOOL_PERMISSIONS`/`AGENT_WRITE_TOOL_PERMISSIONS` and by the
 * system prompt's own prose sections, so hiding a group can never cause the
 * prompt to reference a tool the model wasn't actually given this turn.
 */
export type HarlyToolGroup =
  | "general"
  | "integrations"
  | "automations"
  | "candidates"
  | "jobs"
  | "interviews"
  | "tasks"
  | "inbox"
  | "offers"
  | "talentPool"
  | "templates"
  | "reports"
  | "aiGeneration";

export const TOOL_GROUPS: Record<HarlyToolGroup, readonly string[]> = {
  // Always on: cheap, small, and load-bearing for almost every reply
  // (capability/permission answers, undo, product knowledge).
  general: [
    // Interactive answer blocks (lists, tables, charts, choices, forms): the
    // answer-style contract asks for it on every reply, so it is always on.
    "presentUi",
    "workspaceCapabilities",
    "userPermissions",
    "harlyProductKnowledge",
    "recentAgentActions",
    "undoAgentAction",
  ],
  // Live connection status: integration/provider questions and scheduling.
  integrations: ["connectedIntegrations"],
  automations: [
    "listAutomationTools",
    "getAutomationContext",
    "getAutomationSubgraph",
    "searchAutomations",
    "resolveAutomationResources",
    "prepareAutomationPlan",
    "prepareAutomationPatch",
    "rebaseAutomationPatch",
    "simulateAutomationProposal",
    "queueAutomationSimulation",
    "getAutomationJob",
    "runBranchCoverage",
    "diagnoseWorkflowRun",
    "prepareAutomationRepair",
    "applyAutomationProposal",
    "retryAutomationRun",
    "reconcileAutomationRun",
    "replayAutomationRun",
  ],
  candidates: [
    "reviewPipeline",
    "candidatesNeedingReview",
    "searchCandidates",
    "resolveCandidate",
    "resolveApplication",
    "listCandidates",
    "candidateProfile",
    "getCandidateContext",
    "getApplicationContext",
    "reviewCandidate",
    "nextCandidateStage",
    "candidateNextAction",
    "getCandidateScore",
    "candidateScorecards",
    "moveCandidateStage",
    "rejectCandidate",
    "addCandidateNote",
    "addCandidateTag",
    "createScorecard",
    "sendCandidateEmail",
  ],
  jobs: [
    "hiringBrief",
    "jobsAtRisk",
    "resolveJob",
    "listJobs",
    "jobDetail",
    "getJobStatus",
    "jobContext",
    "jobDistributionOptions",
    "createJob",
  ],
  interviews: [
    "upcomingInterviews",
    "todayInterviews",
    "prepareInterview",
    "interviewBrief",
    "summarizeInterviewNotes",
    "scheduleInterview",
  ],
  tasks: ["listTasks", "listMyTasks", "taskCounts", "createTask", "updateTask", "completeMyOpenTasks"],
  inbox: ["inbox"],
  offers: ["listCandidateOffers", "createOffer", "sendOffer", "decideOffer"],
  talentPool: ["talentPool", "addToTalentPool", "assignFromPoolToJob"],
  templates: ["listEmailTemplates", "emailTemplate"],
  reports: ["reportsOverview", "hiringReport"],
  aiGeneration: [
    "compareCandidates",
    "detectDuplicates",
    "draftCandidateEmail",
    "generateJobDraft",
    "generateScreeningQuestions",
    "generateCandidateScore",
    "bulkScoreJob",
  ],
};

const GENERAL_GROUPS: readonly HarlyToolGroup[] = ["general"];

/**
 * Cheap read helpers offered on every step of every turn, whatever the routed
 * groups are. They are the "bounded widen": enough to resolve a named person
 * or job and read it, so a turn whose keywords routed narrowly can still
 * self-heal without the full ~85-tool catalog (≈35k tokens of schemas) being
 * sent on every step.
 */
export const READ_HELPER_TOOLS: readonly string[] = [
  "resolveCandidate",
  "searchCandidates",
  "candidateProfile",
  "getCandidateContext",
  "resolveApplication",
  "resolveJob",
  "jobContext",
  "listJobs",
  "hiringBrief",
];

/**
 * Groups used when a turn carries no group keyword and no structural signal
 * ("hola", "Charlotte Dubois?"). Everyday read surfaces only: the automation
 * group alone is ~95k characters of schema, so it is never part of a guess.
 */
const DEFAULT_GROUPS: readonly HarlyToolGroup[] = [
  "general",
  "candidates",
  "jobs",
  "interviews",
  "tasks",
];

/**
 * Per-group activation matchers. Deliberately more granular than
 * `classifyHarlyIntent` (which returns one of a few coarse categories used
 * only as a prompt hint): each group has its own keyword surface, so a
 * message can legitimately activate several groups at once (e.g. "schedule
 * an interview for the candidate in the Backend job" touches candidates,
 * jobs, and interviews). False positives only cost a few extra tool schemas;
 * false negatives fall back to `DEFAULT_GROUPS` plus `READ_HELPER_TOOLS`.
 */
const GROUP_MATCHERS: Partial<Record<HarlyToolGroup, RegExp>> = {
  integrations: /\b(integra|connect|conect|conex|reconnect|reconex|calendar|calendario|google|meet\b|zoom|teams|outlook|slack|cal\.com|jitsi|linkedin|indeed|sync|sincroniz|provider|proveedor)\w*/i,
  automations: /\b(automat(?:ion|izaci[oó]n|izar)|workflow|flujo|webhook|trigger|disparador|branch coverage|proposal)\w*/i,
  candidates: /\b(candidat[oa]s?|applicant|postulant|reject|rechaz|descart|move|mueve|advance|avanza|pasa(?:r|lo|la)?\b|pass\b|stage|etapa|pipeline|scorecard|tag\b|etiquet|note\b|nota\b|summar|resum|profile|perfil|cv\b|resume\b|review|revis|evalu|opin|who is|qui[eé]n es|tell me about|h[aá]blame|email|correo|mail)\w*/i,
  jobs: /\b(job|puesto|vacante|role\b|rol\b|hiring brief|distribution|publish|publica|career page|catch me up|ponme al d[ií]a|attention|atenci[oó]n|prioridad|priorit)\w*/i,
  interviews: /\b(interview|entrevista|schedule|agenda|calendar|calendario|meeting|reuni[oó]n)\w*/i,
  tasks: /\b(task|tarea|to-?do|pendiente)\w*/i,
  inbox: /\b(inbox|bandeja)\w*/i,
  offers: /\b(offer|oferta)\w*/i,
  talentPool: /\b(talent pool|pool de talento|pool\b)\w*/i,
  templates: /\b(template|plantilla)\w*/i,
  reports: /\b(report|reporte|kpi|funnel|embudo|time-?to-?hire|analytics|m[eé]trica|metric)\w*/i,
  aiGeneration: /\b(score|puntaje|puntuaci[oó]n|compare|compara|duplicate|duplicad[oa]|draft|borrador|screening question|redacta|escribe)\w*/i,
};

/**
 * A person's name written as two capitalised words ("Charlotte Dubois") is a
 * strong candidate signal even without a keyword.
 */
const PERSON_NAME_RE = /\b\p{Lu}[\p{Ll}'’-]+\s+\p{Lu}[\p{Ll}'’-]+/u;

/** Coarse intents that need product/capability tools, not workspace records. */
const PRODUCT_ONLY_INTENTS: ReadonlySet<HarlyIntent> = new Set([
  "product_docs",
  "general_advice",
]);

export type ToolRoutingContext = {
  message: string;
  intent: HarlyIntent;
  activeCandidateId?: string | null;
  mentionedCandidateIds?: readonly string[];
  activeAutomation?: HarlyToolContext["activeAutomation"];
  /**
   * Tools called in the last couple of turns. Their groups stay active so a
   * follow-up ("sí", "and the other one?") keeps the surface it continues.
   */
  recentToolNames?: readonly string[];
};

const GROUP_BY_TOOL: ReadonlyMap<string, HarlyToolGroup> = new Map(
  (Object.entries(TOOL_GROUPS) as Array<[HarlyToolGroup, readonly string[]]>).flatMap(
    ([group, names]) => names.map((name) => [name, group] as const),
  ),
);

/**
 * Decide which tool groups are active for a turn. The same set is used on
 * EVERY step of the turn (see `selectActiveToolNames`), which keeps the tool
 * list byte-stable so Anthropic prompt caching hits between steps. It never
 * removes a tool a permission check would have kept; it only decides which of
 * the already-permission-filtered tools are offered.
 *
 * Safety rule: when there is no signal, fall back to the everyday read
 * groups (`DEFAULT_GROUPS`) rather than guessing one narrow group; the read
 * helpers are always added on top.
 */
export function resolveActiveToolGroups(ctx: ToolRoutingContext): Set<HarlyToolGroup> {
  const active = new Set<HarlyToolGroup>(GENERAL_GROUPS);

  // Structural context signals are stronger than keyword matches: if the UI
  // is already scoped to an automation or a candidate, that group is
  // relevant regardless of what the message says.
  if (ctx.activeAutomation) active.add("automations");
  if (ctx.activeCandidateId || ctx.mentionedCandidateIds?.length) {
    active.add("candidates");
  }
  for (const name of ctx.recentToolNames ?? []) {
    const group = GROUP_BY_TOOL.get(name);
    if (group) active.add(group);
  }

  // Natural requests such as “cuando un candidato postule…” are valid
  // workflow requests even when the user never says “automatización” or
  // “trigger”. Keep the turn narrow enough for model context while making
  // the complete automation orchestration surface available.
  if (ctx.intent === "automation_build") {
    active.add("automations");
    return active;
  }

  const text = ctx.message.trim();
  let matchedAnyKeyword = false;
  for (const [group, matcher] of Object.entries(GROUP_MATCHERS) as Array<
    [HarlyToolGroup, RegExp]
  >) {
    if (matcher.test(text)) {
      active.add(group);
      matchedAnyKeyword = true;
    }
  }
  if (PERSON_NAME_RE.test(text)) {
    active.add("candidates");
    matchedAnyKeyword = true;
  }

  // Product/advice questions are answered from the always-on general group
  // (capabilities, permissions, product knowledge) plus the read helpers.
  if (!matchedAnyKeyword && PRODUCT_ONLY_INTENTS.has(ctx.intent)) {
    return active;
  }

  // No keyword and no structural signal beyond "general": offer the
  // everyday read surfaces instead of the whole catalog.
  if (!matchedAnyKeyword && active.size <= GENERAL_GROUPS.length) {
    DEFAULT_GROUPS.forEach((group) => active.add(group));
  }

  // Scheduling checks live provider status before proposing an interview;
  // capability questions often hinge on what is connected right now.
  if (active.has("interviews") || ctx.intent === "capability") active.add("integrations");

  return active;
}

/** Expands `groups` into the concrete tool names covered by each group. */
export function toolNamesForGroups(groups: ReadonlySet<HarlyToolGroup>): string[] {
  const names: string[] = [];
  for (const group of groups) names.push(...TOOL_GROUPS[group]);
  return names;
}

/**
 * Offered only on turns that may change something: every write tool, plus the
 * read tools whose only job is preparing a stage move.
 */
const WRITE_TURN_ONLY_TOOLS: ReadonlySet<string> = new Set([
  ...AGENT_WRITE_TOOLS,
  "nextCandidateStage",
  "candidateNextAction",
]);

/**
 * Any hint that the user wants something changed (or is confirming a change
 * Harly just suggested: "sí", "dale", "go ahead"). Deliberately broad: a false
 * positive only adds a few write schemas, a false negative hides the action.
 */
const WRITE_SIGNAL_RE =
  /\b(send|env[ií]a|enviar|manda|mandar|m[aá]ndale|mail|email|correo|reject|rechaz|descart|move|mueve|mover|advance|avanza|p[aá]sa|pass|schedule|agenda|programa|reprograma|create|crea|crear|add|agrega|a[nñ]ade|tag|etiquet|note|nota|scorecard|score|puntu|punt[uú]a|review|revis|evalu|offer|oferta|assign|asigna|complete|completa|marca|mark|update|actualiza|cambia|change|edit|modifica|undo|deshaz|deshac|revert|revi[eé]rte|invite|invita|hire|contrata|decide|accept|acepta|approve|aprueba|decline|pool|apply|aplica|retry|reintenta|replay|reconcil|repar|fix|arregla|proceed|procede|confirm)\w*/i;
/** Short confirmations, matched as whole words only. */
const CONFIRMATION_RE = /(^|[\s¡!¿,.])(s[ií]|yes|ok|okay|dale|hazlo|do it|go ahead|adelante|claro|sure)(?=$|[\s!?,.])/iu;

/**
 * Whether this turn offers write tools. Read-only turns ("summarize X",
 * "what's the status of Y") skip every write schema; any action wording, an
 * action/automation intent, or the automation builder turns them back on.
 */
export function turnNeedsWriteTools(ctx: ToolRoutingContext): boolean {
  if (ctx.intent === "action" || ctx.intent === "automation_build") return true;
  if (ctx.activeAutomation) return true;
  return WRITE_SIGNAL_RE.test(ctx.message) || CONFIRMATION_RE.test(ctx.message.trim());
}

/**
 * Restricts `toolNames` (a permission-filtered tool set's keys) down to the
 * active groups plus `READ_HELPER_TOOLS`, preserving the caller's original
 * tool object order (stable order = stable prompt-cache prefix). Returns
 * `undefined` when every available tool is already active, so callers can
 * pass that straight through as "no activeTools override" without allocating.
 */
export function selectActiveToolNames(
  availableToolNames: readonly string[],
  groups: ReadonlySet<HarlyToolGroup>,
  options: { includeWrites?: boolean } = {},
): string[] | undefined {
  const includeWrites = options.includeWrites ?? true;
  const activeNames = new Set([...toolNamesForGroups(groups), ...READ_HELPER_TOOLS]);
  const selected = availableToolNames.filter(
    (name) =>
      activeNames.has(name) &&
      (includeWrites || !WRITE_TURN_ONLY_TOOLS.has(name)),
  );
  if (selected.length === availableToolNames.length) return undefined;
  return selected;
}

/**
 * Fails loudly if any tool the server actually built is missing from every
 * group (it would then never be reachable once the gateway narrows the
 * active set) or appears in more than one group (ambiguous ownership).
 * Called once per request in non-production and by a dedicated unit test,
 * so a newly added tool that forgets to join a group breaks CI immediately
 * instead of silently becoming unreachable through the chat gateway.
 */
export function assertToolRoutingCoversAllTools(allToolNames: readonly string[]): void {
  const seenIn = new Map<string, HarlyToolGroup[]>();
  for (const [group, names] of Object.entries(TOOL_GROUPS) as Array<
    [HarlyToolGroup, readonly string[]]
  >) {
    for (const name of names) {
      const owners = seenIn.get(name) ?? [];
      owners.push(group);
      seenIn.set(name, owners);
    }
  }

  const duplicated = [...seenIn.entries()].filter(([, owners]) => owners.length > 1);
  if (duplicated.length > 0) {
    throw new Error(
      `Harly tool routing: tool(s) declared in multiple groups: ${duplicated
        .map(([name, owners]) => `${name} (${owners.join(", ")})`)
        .join("; ")}`,
    );
  }

  const uncovered = allToolNames.filter((name) => !seenIn.has(name));
  if (uncovered.length > 0) {
    throw new Error(
      `Harly tool routing: tool(s) not assigned to any group in tool-routing.ts, so the gateway can never surface them: ${uncovered.join(", ")}`,
    );
  }
}
