import "server-only";

import type { HarlyIntent } from "./intent";
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
    "workspaceCapabilities",
    "userPermissions",
    "harlyProductKnowledge",
    "connectedIntegrations",
    "recentAgentActions",
    "undoAgentAction",
  ],
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
const ALL_GROUPS = Object.keys(TOOL_GROUPS) as HarlyToolGroup[];

/**
 * Per-group activation matchers. Deliberately more granular than
 * `classifyHarlyIntent` (which returns one of six coarse categories used only
 * as a prompt hint): each group has its own keyword surface, so a message can
 * legitimately activate several groups at once (e.g. "schedule an interview
 * for the candidate in the Backend job" touches candidates, jobs, and
 * interviews). False positives here only cost a few extra tool schemas in
 * the request; false negatives are the real risk, which is why every
 * uncertain case falls through to "activate everything" (see
 * `resolveActiveToolGroups`).
 */
const GROUP_MATCHERS: Partial<Record<HarlyToolGroup, RegExp>> = {
  automations: /\b(automat(?:ion|izaci[oó]n|izar)|workflow|flujo|webhook|trigger|disparador|branch coverage|proposal)\w*/i,
  candidates: /\b(candidat[oa]s?|applicant|postulant|reject|rechaz|move|mueve|advance|avanza|stage|pipeline|scorecard|tag\b|note\b|nota\b)\w*/i,
  jobs: /\b(job|puesto|vacante|role\b|rol\b|hiring brief|distribution|publish|publica)\w*/i,
  interviews: /\b(interview|entrevista|schedule|agenda|calendar|calendario|meeting|reuni[oó]n)\w*/i,
  tasks: /\b(task|tarea|to-?do|pendiente)\w*/i,
  inbox: /\b(inbox|bandeja)\w*/i,
  offers: /\b(offer|oferta)\w*/i,
  talentPool: /\b(talent pool|pool de talento|pool\b)\w*/i,
  templates: /\b(template|plantilla)\w*/i,
  reports: /\b(report|reporte|kpi|funnel|embudo|time-?to-?hire|analytics)\w*/i,
  aiGeneration: /\b(score|puntaje|puntuaci[oó]n|compare|compara|duplicate|duplicad[oa]|draft|borrador|screening question)\w*/i,
};

/** Coarse `classifyHarlyIntent` categories that should always widen the set
 * to every group rather than narrow it, because they carry no group-specific
 * signal by themselves. */
const NON_NARROWING_INTENTS: ReadonlySet<HarlyIntent> = new Set([
  "product_docs",
  "general_advice",
  "ambiguous",
]);

export type ToolRoutingContext = {
  message: string;
  intent: HarlyIntent;
  activeCandidateId?: string | null;
  mentionedCandidateIds?: readonly string[];
  activeAutomation?: HarlyToolContext["activeAutomation"];
};

/**
 * Decide which tool groups are active for the FIRST step of a turn. This is
 * the narrowing side of the gateway (Phase 6, AI10): it never removes a tool
 * a permission check would have kept, it only decides which of the
 * already-permission-filtered tools are offered to the model up front.
 *
 * Safety rule: when in doubt, widen. Ambiguous/product/advice intents, or a
 * message that doesn't match any group keyword, activate every group (the
 * pre-Phase-6 behavior) instead of guessing narrowly and risking a false
 * negative.
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

  // Natural requests such as “cuando un candidato postule…” are valid
  // workflow requests even when the user never says “automatización” or
  // “trigger”. Keep the first turn narrow enough for model context while
  // making the complete automation orchestration surface available.
  if (ctx.intent === "automation_build") {
    active.add("automations");
    return active;
  }

  if (NON_NARROWING_INTENTS.has(ctx.intent)) {
    ALL_GROUPS.forEach((group) => active.add(group));
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

  // No keyword and no structural signal beyond "general": we cannot
  // distinguish intent narrowly enough to safely exclude a group, so widen
  // to everything rather than risk hiding a tool the turn actually needs.
  if (!matchedAnyKeyword && active.size <= GENERAL_GROUPS.length) {
    ALL_GROUPS.forEach((group) => active.add(group));
  }

  return active;
}

/** Expands `groups` into the concrete tool names covered by each group. */
export function toolNamesForGroups(groups: ReadonlySet<HarlyToolGroup>): string[] {
  const names: string[] = [];
  for (const group of groups) names.push(...TOOL_GROUPS[group]);
  return names;
}

/**
 * Widens the active set for later steps. Phase-6 routing is only meant to
 * sharpen the model's FIRST decision; once it has already spent a step
 * calling tools, further narrowing only risks blocking a legitimate
 * multi-category task (e.g. resolve a candidate, then build an automation
 * for them) for no measurable benefit. From `stepNumber` 2 onward every
 * permission-filtered tool is offered again.
 */
export function shouldWidenForStep(stepNumber: number): boolean {
  return stepNumber >= 2;
}

/**
 * Restricts `toolNames` (a permission-filtered tool set's keys) down to the
 * active groups, preserving the caller's original tool object keys. Returns
 * `undefined` when every available tool is already active, so callers can
 * pass that straight through as "no activeTools override" without allocating.
 */
export function selectActiveToolNames(
  availableToolNames: readonly string[],
  groups: ReadonlySet<HarlyToolGroup>,
): string[] | undefined {
  const activeNames = new Set(toolNamesForGroups(groups));
  const selected = availableToolNames.filter((name) => activeNames.has(name));
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
