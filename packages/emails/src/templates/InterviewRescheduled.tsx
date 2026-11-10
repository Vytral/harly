import { Hr, Section, Text } from "@react-email/components";

import { emailTranslator } from "../i18n";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { DetailTable } from "./DetailTable";
import { buildCalendarLinks } from "./calendarLinks";
import type { SocialLink } from "./HarlyLayout";

export type InterviewRescheduledProps = {
  candidateName: string;
  locale?: string | null;
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

export function interviewRescheduledSubject({
  companyName,
  jobTitle,
  locale,
}: Pick<InterviewRescheduledProps, "companyName" | "jobTitle" | "locale">) {
  return emailTranslator(locale)("interviewRescheduled.subject", { company: companyName, job: jobTitle });
}

export function InterviewRescheduled({
  candidateName,
  locale,
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
}: InterviewRescheduledProps) {
  const t = emailTranslator(locale);
  const rows = [
    { label: t("interviewRescheduled.time"), value: when },
    { label: t("interviewShared.format"), value: mode },
    ...(location ? [{ label: t("interviewShared.where"), value: location }] : []),
    ...(duration ? [{ label: t("interviewShared.duration"), value: duration }] : []),
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
      preview={t("interviewRescheduled.preview", { type: interviewType.toLowerCase(), when })}
      locale={locale}
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      accentColor={accentColor}
      socialLinks={socialLinks}
      hideBranding={hideBranding}
    >
      <Text className="text-[40px] leading-[1.05] tracking-[-1px] font-inter text-fg m-0 mb-3.5 font-medium">
        {t("interviewRescheduled.heading")}
      </Text>
      <Text className="text-[14px] leading-[1.5] font-inter text-fg-2 m-0 mb-4">
        {t.rich("interviewRescheduled.body", { name: candidateName, type: interviewType.toLowerCase(), job: jobTitle, company: companyName, strong: (chunks) => <span className="text-fg font-semibold">{chunks}</span> })}
      </Text>
      <DetailTable rows={rows} />

      {calendarLinks ? (
        <Section className="mb-5">
          <Text className="text-[13px] leading-[1.5] tracking-[-0.039px] font-inter text-fg-3 m-0 mb-2.5">
            {t("interviewRescheduled.calendar")}
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
                    {t("interviewShared.download")}
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
        {t("interviewRescheduled.outro")}
      </Text>
    </WorkspaceLayout>
  );
}

InterviewRescheduled.PreviewProps = {
  candidateName: "Ava Thompson",
  companyName: "Acme Inc.",
  jobTitle: "Senior Frontend Engineer",
  interviewType: "Technical interview",
  when: "Friday, July 4 at 10:00 AM",
  mode: "Video call",
  duration: "60 minutes",
  startIso: "2026-07-04T10:00:00Z",
  durationMins: 60,
} satisfies InterviewRescheduledProps;
