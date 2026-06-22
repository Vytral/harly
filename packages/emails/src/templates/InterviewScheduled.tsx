import { Text } from "@react-email/components";

import { heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { DetailTable } from "./DetailTable";
import type { SocialLink } from "./HarlyLayout";

export type InterviewScheduledProps = {
  candidateName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  jobTitle: string;
  interviewType: string;
  when: string;
  mode: string;
  location?: string;
  duration?: string;
};

export function interviewScheduledSubject({
  companyName,
  jobTitle,
}: Pick<InterviewScheduledProps, "companyName" | "jobTitle">) {
  return `Interview scheduled — ${jobTitle} at ${companyName}`;
}

export function InterviewScheduled({
  candidateName,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  jobTitle,
  interviewType,
  when,
  mode,
  location,
  duration,
}: InterviewScheduledProps) {
  const rows = [
    { label: "When", value: when },
    { label: "Format", value: mode },
    ...(location ? [{ label: "Where", value: location }] : []),
    ...(duration ? [{ label: "Duration", value: duration }] : []),
  ];

  return (
    <WorkspaceLayout
      preview={`Your ${interviewType.toLowerCase()} for ${jobTitle} at ${companyName} is confirmed — ${when}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
    >
      <Text style={heading}>Interview confirmed</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        Your <strong>{interviewType.toLowerCase()}</strong> for{" "}
        <strong>{jobTitle}</strong> at {companyName} is confirmed.
      </Text>
      <DetailTable rows={rows} />
      <Text style={text}>
        If you need to reschedule or have any questions, just reply to this
        email.
      </Text>
    </WorkspaceLayout>
  );
}
