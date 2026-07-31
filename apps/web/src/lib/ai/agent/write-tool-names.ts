/**
 * Client-safe registry of Harly AI write tool names. Kept separate from
 * write-actions.ts (which is "use server" and may only export async functions)
 * so the panel can import the sync guard without pulling server code.
 *
 * Keep this list in sync with the HANDLERS map in write-actions.ts and the
 * tool definitions in write-tools.ts.
 */
export const AGENT_WRITE_TOOLS = [
  "undoAgentAction",
  "moveCandidateStage",
  "rejectCandidate",
  "createTask",
  "updateTask",
  "completeMyOpenTasks",
  "createJob",
  "addCandidateNote",
  "addCandidateTag",
  "createOffer",
  "sendOffer",
  "decideOffer",
  "scheduleInterview",
  "addToTalentPool",
  "assignFromPoolToJob",
  "createScorecard",
  "sendCandidateEmail",
  "generateCandidateScore",
  "bulkScoreJob",
] as const;

export type AgentWriteTool = (typeof AGENT_WRITE_TOOLS)[number];

export function isAgentWriteTool(name: string): name is AgentWriteTool {
  return (AGENT_WRITE_TOOLS as readonly string[]).includes(name);
}
