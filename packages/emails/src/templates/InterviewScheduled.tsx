import { Button, Hr, Section, Text } from "@react-email/components";

import { WorkspaceLayout } from "./WorkspaceLayout";
import { DetailTable } from "./DetailTable";
import { buildCalendarLinks } from "./calendarLinks";
import type { SocialLink } from "./HarlyLayout";

export type InterviewScheduledProps = {
  candidateName: string;
  companyName: string;
  companyLogoUrl?: string;
  accentColor?: string;
  socialLinks?: SocialLink[];
  hideBranding?: boolean;
  jobTitle: string;
  interviewType: string;
  when: string;
  mode: string;
  location?: string;
  duration?: string;
  startIso?: string;
  durationMins?: number;
  notes?: string;
};

export function interviewScheduledSubject({
  companyName,
  jobTitle,
}: Pick<InterviewScheduledProps, "companyName" | "jobTitle">) {
  return `Interview confirmed — ${jobTitle} at ${companyName}`;
}

export function InterviewScheduled({
  candidateName,
  companyName,
  companyLogoUrl,
  accentColor,
  socialLinks,
  hideBranding,
  jobTitle,
  interviewType,
  when,
  mode,
  location,
  duration,
  startIso,
  durationMins,
  notes,
}: InterviewScheduledProps) {
  const rows = [
    { label: "When", value: when },
    { label: "Format", value: mode },
    ...(location ? [{ label: "Where", value: location }] : []),
    ...(duration ? [{ label: "Duration", value: duration }] : []),
  ];

  let calendarLinks: ReturnType<typeof buildCalendarLinks> | null = null;
  if (startIso && durationMins) {
    calendarLinks = buildCalendarLinks({
      summary: `${interviewType} — ${jobTitle}`,
      start: new Date(startIso),
      durationMins,
      description: notes,
      location,
    });
  }

  return (
    <WorkspaceLayout
      preview={`Your ${interviewType.toLowerCase()} is confirmed for ${when}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        Interview confirmed
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Hi {candidateName}, your{" "}
        <span className="text-fg font-semibold">{interviewType.toLowerCase()}</span> for{" "}
        <span className="text-fg font-semibold">{jobTitle}</span> at {companyName} is on the calendar.
      </Text>
      <DetailTable rows={rows} />

      {calendarLinks ? (
        <Section className="mb-5">
          <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0 mb-2.5">
            Add it to your calendar
          </Text>
          <table>
            <tbody>
              <tr>
                <td className="pr-2 pb-2" style={{ paddingRight: 8, paddingBottom: 8 }}>
                  <a
                    href={calendarLinks.googleCalendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-brand text-[14px] leading-[1.5] font-inter text-fg-inverted inline-block border-none px-4 py-2.5 text-center box-border no-underline"
                  >
                    Google Calendar
                  </a>
                </td>
                <td className="pb-2" style={{ paddingBottom: 8 }}>
                  <a
                    href={calendarLinks.icsDataUri}
                    download={`${interviewType}-${jobTitle}.ics`}
                    className="border-stroke text-[14px] leading-[1.5] font-inter text-fg inline-block border bg-bg px-4 py-2.5 text-center box-border no-underline"
                  >
                    Download .ics
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
      ) : null}

      {notes ? (
        <>
          <Hr className="border-stroke border-t my-7" />
          <Text className="text-[14px] leading-[1.5] font-inter text-fg-3 m-0 mb-4">{notes}</Text>
        </>
      ) : null}

      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        Need to reschedule? Just reply to this email.
      </Text>
    </WorkspaceLayout>
  );
}

InterviewScheduled.PreviewProps = {
  candidateName: "Ava Thompson",
  companyName: "Acme Inc.",
  jobTitle: "Senior Frontend Engineer",
  interviewType: "Technical interview",
  when: "Thursday, July 3 at 2:00 PM",
  mode: "Video call",
  duration: "60 minutes",
  startIso: "2026-07-03T14:00:00Z",
  durationMins: 60,
} satisfies InterviewScheduledProps;
