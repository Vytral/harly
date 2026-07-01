import { Text } from "@react-email/components";

import { heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";

export type InterviewCanceledProps = {
  candidateName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  jobTitle: string;
  interviewType: string;
  when?: string;
  reason?: string;
};

export function interviewCanceledSubject({
  companyName,
  jobTitle,
}: Pick<InterviewCanceledProps, "companyName" | "jobTitle">) {
  return `Interview canceled — ${jobTitle} at ${companyName}`;
}

export function InterviewCanceled({
  candidateName,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  jobTitle,
  interviewType,
  when,
  reason,
}: InterviewCanceledProps) {
  return (
    <WorkspaceLayout
      preview={`Your ${interviewType.toLowerCase()} for ${jobTitle} has been canceled.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
    >
      <Text style={heading}>Interview canceled</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        Your <strong>{interviewType.toLowerCase()}</strong> for{" "}
        <strong>{jobTitle}</strong>
        {when ? (
          <>
            {" "}scheduled for <strong>{when}</strong>
          </>
        ) : null}{" "}
        has been canceled.
      </Text>
      {reason ? (
        <Text style={text}>{reason}</Text>
      ) : null}
      <Text style={text}>Reply to this email and we&apos;ll find a new time.</Text>
    </WorkspaceLayout>
  );
}

InterviewCanceled.PreviewProps = {
  candidateName: "Ava Thompson",
  companyName: "Acme Inc.",
  jobTitle: "Senior Frontend Engineer",
  interviewType: "Technical interview",
  when: "Thursday, July 3 at 2:00 PM",
} satisfies InterviewCanceledProps;
