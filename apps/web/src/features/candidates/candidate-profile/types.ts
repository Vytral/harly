import type { DocumentRequestItem } from "@/features/documents/requests-shared";
import type {
  ScheduleApplicationOption,
  ScheduleCalConfig,
  ScheduleMemberOption,
} from "@/features/candidates/ScheduleDialog";
import type { CandidateOfferItem } from "@/features/offers/shared";
import type { EmailTemplateOption } from "@/features/candidates/EmailDrawer";
import type { TemplateValues } from "@/features/email-templates/interpolate";
import type { CandidateInterviewItem } from "@/features/interviews/shared";
import type {
  CandidateEducationEntry,
  CandidateExperienceEntry,
  ResumeEducationItem,
  ResumeExperienceItem,
} from "@harly/db";
import type {
  CandidateActivityItem,
  CandidateAiEvaluationItem,
  CandidateApplicationStatus,
  CandidateNoteItem,
  CandidatePrivacyRequestItem,
  NoteMention,
} from "@/features/candidates/data";

export type CandidateProfileApplication = {
  id: string;
  jobId: string;
  jobTitle: string;
  currentStageName: string | null;
  status: CandidateApplicationStatus;
  appliedAt: string;
  source: string | null;
  answers: Array<{ id: string; label: string; type: string; answer: string }>;
};

export type CandidateFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  contentHash: string | null;
  parsedSummary: string | null;
  parsedSkills: string[];
  parsedEducation: string | null;
  parsedExperienceYears: number | null;
  parsedExperience: ResumeExperienceItem[];
  parsedEducationItems: ResumeEducationItem[];
  parsedAt: string | null;
  createdAt: string;
  uploadedByName: string | null;
  uploadedByEmail: string | null;
};

export type Scorecard = {
  id: string;
  applicationId: string | null;
  rating: "strong" | "mixed" | "weak";
  comment: string | null;
  stageName: string | null;
  authorName: string | null;
  createdAt: string;
};

export type CandidateMessage = {
  id: string;
  threadId: string | null;
  applicationId: string | null;
  direction: "outbound" | "inbound";
  transport: "imap" | "legacy-webhook" | "provider" | "smtp";
  subject: string;
  body: string;
  toEmail: string;
  fromEmail: string | null;
  status: "queued" | "sent" | "failed";
  read: boolean;
  authorName: string | null;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    storageKey: string;
  }>;
  createdAt: string;
};

/** Activity rows arrive from the server with dates already serialised. */
export type CandidateActivityRow = Omit<CandidateActivityItem, "createdAt"> & {
  createdAt: string;
};

export type CandidatePrivacyRow = Omit<
  CandidatePrivacyRequestItem,
  "createdAt" | "completedAt"
> & {
  createdAt: string;
  completedAt: string | null;
};

export type SignableDocument = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  updatedAt: Date | string;
};

export type RelatedDocument = { id: string; name: string; mimeType: string };

export type CandidateProfileTabsProps = {
  candidateId: string;
  workspaceId: string;
  candidateEmail: string;
  candidateName: string;
  candidatePhone: string | null;
  candidateAddress: string | null;
  candidateLinkedinUrl: string | null;
  candidateGithubUrl: string | null;
  candidateWebsiteUrl: string | null;
  candidateSummary: string | null;
  candidateEducationEntries: CandidateEducationEntry[];
  candidateExperienceEntries: CandidateExperienceEntry[];
  stageName: string | null;
  applications: CandidateProfileApplication[];
  notes: CandidateNoteItem[];
  files: CandidateFile[];
  relatedDocuments: RelatedDocument[];
  signableDocuments: Array<{
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    updatedAt: Date;
  }>;
  documentRequests: DocumentRequestItem[];
  canManageDocuments: boolean;
  activity: CandidateActivityRow[];
  scorecards: Scorecard[];
  messages: CandidateMessage[];
  interviews: CandidateInterviewItem[];
  members: NoteMention[];
  aiEvaluations: CandidateAiEvaluationItem[];
  aiConfigured: boolean;
  offers: CandidateOfferItem[];
  offerSignatureChannel: "email" | "esign" | "native";
  emailTemplates?: EmailTemplateOption[];
  emailTemplateValues?: TemplateValues;
  scheduleApplications: ScheduleApplicationOption[];
  scheduleMembers: ScheduleMemberOption[];
  scheduleCal: ScheduleCalConfig;
  currentUserId?: string;
  privacyRequests?: CandidatePrivacyRow[];
  canFulfilErasure?: boolean;
};

/** How many linked records an erasure request would destroy, by kind. */
export type PrivacyInventory = {
  applications: number;
  interviews: number;
  messages: number;
  files: number;
  notes: number;
  scorecards: number;
  aiEvaluations: number;
  offers: number;
  activity: number;
};
