import { Text, Link } from "@react-email/components";

import { heading, text, buttonStyle } from "./styles";
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
                <a href={calendarLinks.icsDataUri} download={`${interviewType}-${jobTitle}.ics`} style={buttonStyle("#44403c")}>
                  Download .ics
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      ) : null}
      <Text style={text}>
        If you need to reschedule or have any questions, just reply to this
        email.
      </Text>
    </WorkspaceLayout>
  );
}
