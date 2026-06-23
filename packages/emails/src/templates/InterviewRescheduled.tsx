import { Text } from "@react-email/components";

import { heading, text, buttonStyle } from "./styles";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { DetailTable } from "./DetailTable";
import { buildCalendarLinks } from "./calendarLinks";
import type { SocialLink } from "./HarlyLayout";

export type InterviewRescheduledProps = {
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
  startIso?: string;
  durationMins?: number;
  notes?: string;
};

export function interviewRescheduledSubject({
  companyName,
  jobTitle,
}: Pick<InterviewRescheduledProps, "companyName" | "jobTitle">) {
  return `Interview rescheduled — ${jobTitle} at ${companyName}`;
}

export function InterviewRescheduled({
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
  startIso,
  durationMins,
  notes,
}: InterviewRescheduledProps) {
  const rows = [
    { label: "New time", value: when },
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
      preview={`Your ${interviewType.toLowerCase()} for ${jobTitle} at ${companyName} has been rescheduled to ${when}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
    >
      <Text style={heading}>Interview rescheduled</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        Your <strong>{interviewType.toLowerCase()}</strong> for{" "}
        <strong>{jobTitle}</strong> at {companyName} has been rescheduled.
      </Text>
      <DetailTable rows={rows} />
      {calendarLinks ? (
        <table style={{ margin: "0 0 20px" }}>
          <tbody>
            <tr>
              <td style={{ paddingRight: 8 }}>
                <a href={calendarLinks.googleCalendarUrl} target="_blank" rel="noopener noreferrer" style={buttonStyle(accentColor)}>
                  Add to Google Calendar
                </a>
              </td>
              <td>
                <a href={calendarLinks.icsDataUri} download={`${interviewType}-${jobTitle}.ics`} style={buttonStyle("#6b7280")}>
                  Download .ics
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      ) : null}
      <Text style={text}>
        If you have any questions or need to adjust further, just reply to this
        email.
      </Text>
    </WorkspaceLayout>
  );
}
