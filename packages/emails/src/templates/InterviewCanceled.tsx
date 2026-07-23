import { Text } from "@react-email/components";

import { WorkspaceLayout } from "./WorkspaceLayout";
import type { SocialLink } from "./HarlyLayout";

export type InterviewCanceledProps = {
  candidateName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
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
  hideBranding,
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
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        Interview canceled
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">Hi {candidateName},</Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Your <span className="text-fg font-semibold">{interviewType.toLowerCase()}</span> for{" "}
        <span className="text-fg font-semibold">{jobTitle}</span>
        {when ? (
          <>
            {" "}scheduled for <span className="text-fg font-semibold">{when}</span>
          </>
        ) : null}{" "}
        has been canceled. We&apos;re sorry for the inconvenience.
      </Text>
      {reason ? (
        <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">{reason}</Text>
      ) : null}
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Reply to this email and we&apos;ll find a new time that works.
      </Text>
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
