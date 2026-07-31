import "server-only";

export type HarlyCapability = {
  id: string;
  name: string;
  domain: "jobs" | "candidates" | "integrations" | "communication";
  status:
    | "available"
    | "connected"
    | "not_configured"
    | "coming_soon"
    | "unsupported"
    | "requires_permission"
    | "temporarily_unavailable";
  mode: "read" | "confirmed_write" | "external_flow" | "unsupported";
  description: string;
  createsNativeJob?: boolean;
  syncsCandidates?: boolean;
  reason?: string;
  limitation?: string;
  requiredPermission?: string;
};

/** Product truth kept separate from the conversational prompt. */
export const HARLY_CAPABILITIES: readonly HarlyCapability[] = [
  {
    id: "jobs.read",
    name: "Read jobs",
    domain: "jobs",
    status: "available",
    mode: "read",
    description: "Read job details, status, pipeline, and public URL.",
  },
  {
    id: "jobs.share_linkedin_link",
    name: "Share a job link on LinkedIn",
    domain: "jobs",
    status: "available",
    mode: "external_flow",
    description: "Open LinkedIn's share flow for a public Harly job URL.",
    createsNativeJob: false,
    syncsCandidates: false,
    limitation:
      "This creates a LinkedIn post containing a link; it does not create a native LinkedIn Job or sync applicants.",
    requiredPermission: "jobs:read",
  },
  {
    id: "jobs.publish_linkedin_native_job",
    name: "Publish a native LinkedIn Job",
    domain: "jobs",
    status: "unsupported",
    mode: "unsupported",
    description: "Create and manage a native LinkedIn Job from Harly.",
    createsNativeJob: false,
    syncsCandidates: false,
    reason: "No LinkedIn Jobs publishing integration is configured.",
    limitation: "No LinkedIn Jobs publishing integration is available.",
  },
  {
    id: "jobs.sync_linkedin_applicants",
    name: "Sync LinkedIn applicants",
    domain: "jobs",
    status: "unsupported",
    mode: "unsupported",
    description: "Import and synchronize applicants from LinkedIn Jobs.",
    createsNativeJob: false,
    syncsCandidates: false,
    reason: "No LinkedIn applicant synchronization integration is configured.",
    limitation:
      "No LinkedIn applicant synchronization integration is available.",
  },
  {
    id: "integrations.read_status",
    name: "Read integration status",
    domain: "integrations",
    status: "available",
    mode: "read",
    description:
      "Inspect safe, workspace-scoped connection status without secrets.",
    requiredPermission: "integrations:read",
  },
  {
    id: "communication.send_candidate_email",
    name: "Send candidate email",
    domain: "communication",
    status: "available",
    mode: "confirmed_write",
    description:
      "Send an email to a resolved workspace candidate after confirmation.",
    requiredPermission: "collab:write",
  },
];

export function getHarlyCapabilities(): HarlyCapability[] {
  return HARLY_CAPABILITIES.map((capability) => ({ ...capability }));
}
