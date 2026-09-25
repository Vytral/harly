import "server-only";

import type { Permission } from "@/features/workspaces/permissions";
import type { AgentWriteTool } from "./write-tool-names";

/**
 * Permission requirements for all Harly AI READ tools.
 * Null indicates a tool available to any authenticated collaboration caller.
 */
export const AGENT_READ_TOOL_PERMISSIONS: Record<string, Permission | null> = {
  // General capabilities & product knowledge
  workspaceCapabilities: null,
  userPermissions: null,
  harlyProductKnowledge: null,
  connectedIntegrations: "collab:write",
  recentAgentActions: "collab:write",

  // Automations
  listAutomationTools: "automations:manage",
  getAutomationContext: "automations:manage",
  getAutomationSubgraph: "automations:manage",
  searchAutomations: "automations:manage",
  resolveAutomationResources: "automations:manage",
  prepareAutomationPlan: "automations:manage",
  prepareAutomationPatch: "automations:manage",
  rebaseAutomationPatch: "automations:manage",
  simulateAutomationProposal: "automations:manage",
  queueAutomationSimulation: "automations:manage",
  getAutomationJob: "automations:manage",
  runBranchCoverage: "automations:manage",
  diagnoseWorkflowRun: "automations:manage",
  prepareAutomationRepair: "automations:manage",

  // Candidates & Applications
  reviewPipeline: "candidates:view",
  candidatesNeedingReview: "candidates:view",
  searchCandidates: "candidates:view",
  resolveCandidate: "candidates:view",
  resolveApplication: "candidates:view",
  listCandidates: "candidates:view",
  candidateProfile: "candidates:view",
  getCandidateContext: "candidates:view",
  getApplicationContext: "candidates:view",
  reviewCandidate: "candidates:view",
  nextCandidateStage: "candidates:view",
  candidateNextAction: "candidates:view",
  getCandidateScore: "collab:write",
  candidateScorecards: "collab:write",
  compareCandidates: "candidates:view",
  detectDuplicates: "candidates:view",
  draftCandidateEmail: "collab:write",

  // Jobs
  hiringBrief: "jobs:view",
  jobsAtRisk: "jobs:view",
  resolveJob: "jobs:view",
  listJobs: "jobs:view",
  jobDetail: "jobs:view",
  getJobStatus: "jobs:view",
  jobContext: "jobs:view",
  jobDistributionOptions: "jobs:view",
  generateJobDraft: "jobs:create",
  generateScreeningQuestions: "jobs:edit",

  // Interviews
  upcomingInterviews: "interviews:feedback",
  todayInterviews: "interviews:feedback",
  prepareInterview: "collab:write",
  interviewBrief: "collab:write",
  summarizeInterviewNotes: "collab:write",

  // Tasks
  listTasks: "tasks:read",
  listMyTasks: "tasks:read",
  taskCounts: "tasks:read",

  // Collaboration / Inbox
  inbox: "collab:write",

  // Offers
  listCandidateOffers: "offers:manage",

  // Talent Pool
  talentPool: "candidates:view",

  // Email Templates
  listEmailTemplates: "templates:manage",
  emailTemplate: "templates:manage",

  // Reports
  reportsOverview: "reports:read",
  hiringReport: "reports:read",
};

/**
 * Permission requirements for all Harly AI WRITE tools.
 */
export const AGENT_WRITE_TOOL_PERMISSIONS: Record<AgentWriteTool, Permission> = {
  undoAgentAction: "collab:write",
  moveCandidateStage: "candidates:move",
  rejectCandidate: "candidates:delete",
  createTask: "tasks:write",
  updateTask: "tasks:write",
  completeMyOpenTasks: "tasks:write",
  createJob: "jobs:create",
  addCandidateNote: "collab:write",
  addCandidateTag: "candidates:edit",
  createOffer: "offers:manage",
  sendOffer: "offers:manage",
  decideOffer: "offers:manage",
  scheduleInterview: "interviews:manage",
  addToTalentPool: "candidates:edit",
  assignFromPoolToJob: "candidates:move",
  createScorecard: "collab:write",
  sendCandidateEmail: "collab:write",
  generateCandidateScore: "collab:write",
  bulkScoreJob: "collab:write",
  applyAutomationProposal: "automations:manage",
  retryAutomationRun: "automations:manage",
  reconcileAutomationRun: "automations:manage",
  replayAutomationRun: "automations:manage",
};

export function getRequiredReadToolPermission(toolName: string): Permission | null {
  if (toolName in AGENT_READ_TOOL_PERMISSIONS) {
    return AGENT_READ_TOOL_PERMISSIONS[toolName] ?? null;
  }
  return null;
}

export function getRequiredWriteToolPermission(toolName: AgentWriteTool): Permission {
  return AGENT_WRITE_TOOL_PERMISSIONS[toolName];
}

export function isToolAllowed(
  toolName: string,
  heldPermissions?: readonly Permission[],
): boolean {
  if (!heldPermissions) return true;
  if (toolName in AGENT_WRITE_TOOL_PERMISSIONS) {
    const required = AGENT_WRITE_TOOL_PERMISSIONS[toolName as AgentWriteTool];
    return heldPermissions.includes(required);
  }
  const required = getRequiredReadToolPermission(toolName);
  if (!required) return true;
  return heldPermissions.includes(required);
}
