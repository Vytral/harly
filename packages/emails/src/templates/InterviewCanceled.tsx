import { Text } from "@react-email/components";

import { heading, text } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";

export type InterviewCanceledProps = {
  candidateName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  jobTitle: string;
  /** Readable interview type, e.g. "Technical interview". */
  interviewType: string;
  /** Optional pre-formatted original time that was canceled. */
  when?: string;
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
  jobTitle,
  interviewType,
  when,
}: InterviewCanceledProps) {
  return (
    <WorkspaceLayout
      preview={`Your ${interviewType.toLowerCase()} for ${jobTitle} at ${companyName} has been canceled.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
    >
      <Text style={heading}>Interview canceled</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        Your <strong>{interviewType.toLowerCase()}</strong> for{" "}
        <strong>{jobTitle}</strong> at {companyName}
        {when ? (
          <>
            {" "}
            scheduled for <strong>{when}</strong>
          </>
        ) : null}{" "}
        has been canceled.
      </Text>
      <Text style={text}>
        If this was unexpected or you would like to find another time, reply to
        this email and the hiring team will follow up.
      </Text>
    </WorkspaceLayout>
  );
}
