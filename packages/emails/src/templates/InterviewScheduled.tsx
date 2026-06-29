import { Text } from "@react-email/components";

import { heading, text, buttonStyle, secondaryButtonStyle } from "./styles";
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
  return `Interview confirmed — ${jobTitle} at ${companyName}`;
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
      preview={`Your ${interviewType.toLowerCase()} is confirmed for ${when}.`}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
    >
      <Text style={heading}>Interview confirmed</Text>
      <Text style={text}>Hi {candidateName},</Text>
      <Text style={text}>
        Your <strong>{interviewType.toLowerCase()}</strong> for{" "}
        <strong>{jobTitle}</strong> at {companyName} is set. Here are the
        details:
      </Text>
      <DetailTable rows={rows} />
      {calendarLinks ? (
        <table style={{ margin: "0 0 20px" }}>
          <tbody>
            <tr>
              <td style={{ paddingRight: 8 }}>
                <a
                  href={calendarLinks.googleCalendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={buttonStyle(accentColor)}
                >
                  Add to Google Calendar
                </a>
              </td>
              <td>
                <a
                  href={calendarLinks.icsDataUri}
                  download={`${interviewType}-${jobTitle}.ics`}
                  style={secondaryButtonStyle()}
                >
                  Download .ics
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      ) : null}
      {notes ? <Text style={{ ...text, color: "#78716c" }}>{notes}</Text> : null}
      <Text style={text}>Need to reschedule? Just reply to this email.</Text>
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
