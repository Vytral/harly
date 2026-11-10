import Link from "next/link";
import type { Route } from "next";
import {
  ArrowLeft,
  Briefcase,
  UserRoundX,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoRow, InfoRows } from "@/components/ui/info-row";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type {
  PersonJobRow,
  PersonProfile as PersonProfileData,
} from "@/features/people/actions";
import { PersonAvailabilityCard } from "@/features/people/PersonAvailabilityCard";
import { PersonJobsSection } from "@/features/people/PersonJobsSection";

export async function PersonProfile({
  profile,
  jobs,
}: {
  profile: PersonProfileData;
  jobs: PersonJobRow[];
}) {
  const t = await getTranslations("features.people.PersonProfile");
  const hasAbout = Boolean(profile.bio);
  const hasJobs = jobs.length > 0;
  const hasSpecialties = Boolean(
    profile.specialties?.length || profile.languages?.length,
  );
  const hasContact = Boolean(
    profile.phone ||
      profile.linkedinUrl ||
      profile.githubUrl ||
      profile.websiteUrl,
  );
  const hasAvailability = Boolean(
    profile.timezone ||
      profile.capacityHoursPerWeek ||
      (profile.weeklyAvailability &&
        Object.values(profile.weeklyAvailability).some(
          (ranges) => ranges.length > 0,
        )),
  );

  // The right sidebar only renders cards that have content; when it would be
  // empty, the main column goes full-width so there's no dangling 320px gap.
  const hasSidebar = hasContact || hasSpecialties || hasAvailability;
  // A profile is "sparse" when the main column has no real content to show.
  const mainColumnEmpty = !hasAbout && !hasJobs;

  return (
    <div className="space-y-6">
      <Link
        href={"/people" as Route}
        className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm text-soft-ink outline-offset-4 transition-colors hover:text-near-ink focus-visible:outline-2 focus-visible:outline-near-ink"
      >
        <ArrowLeft className="size-3.5" />
        {t("backToPeople")}
      </Link>

      <PersonHeader profile={profile} />

      <div
        className={
          hasSidebar
            ? "grid items-start gap-4 lg:grid-cols-[minmax(0,360px)_1fr]"
            : "grid items-start gap-4"
        }
      >
        {hasSidebar && (
          <div className="space-y-4">
            <ContactCard profile={profile} />
            {hasSpecialties && <SpecialtiesCard profile={profile} />}
            <PersonAvailabilityCard
              timezone={profile.timezone}
              weeklyAvailability={profile.weeklyAvailability}
              capacityHoursPerWeek={profile.capacityHoursPerWeek}
            />
          </div>
        )}

        <div className="min-w-0 space-y-4">
          {hasAbout && (
            <Card>
              <CardHeader>
                <CardTitle>{t("about")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[14px] leading-relaxed whitespace-pre-line text-near-ink">
                  {profile.bio}
                </p>
              </CardContent>
            </Card>
          )}

          {hasJobs ? (
            <PersonJobsSection jobs={jobs} />
          ) : mainColumnEmpty ? (
            <Card className="min-h-[16rem] items-center justify-center px-6 py-12 text-center">
              <div className="mb-1 grid size-11 place-items-center rounded-full bg-lime-wash text-near-ink">
                <UserRoundX className="size-5" />
              </div>
              <h2 className="text-sm font-semibold text-near-ink">
                {t("nothingHereYet")}
              </h2>
              <p className="max-w-sm text-sm leading-6 text-soft-ink">
                {t("emptyProfile", { name: profile.name })}
              </p>
            </Card>
          ) : (
            <div className="rounded-[var(--radius-card)] bg-card-inset px-5 py-6 text-center text-sm text-soft-ink">
              {t("notOnAnyJobs")}
            </div>
          )}
        </div>
      </div>

      <NothingElseFooter />
    </div>
  );
}

/** A quiet end-of-page marker so sparse profiles don't trail into blank space. */
async function NothingElseFooter() {
  const t = await getTranslations("features.people.PersonProfile");
  return (
    <div className="flex flex-col items-center gap-1.5 pt-2 pb-6 text-center">
      <div className="h-px w-10 bg-hairline" />
      <p className="text-xs text-quiet-mist">
        {t("nothingElse")}
      </p>
    </div>
  );
}

function PersonHeader({ profile }: { profile: PersonProfileData }) {
  return (
    <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <UserAvatar name={profile.name} src={profile.image} size="xl" />
      <div className="min-w-0">
        <h1 className="font-display text-[28px] leading-tight tracking-[-0.01em] text-near-ink">
          {profile.name}
        </h1>
        <p className="mt-0.5 text-[14px] text-soft-ink">
          {[profile.jobTitle, profile.username ? `@${profile.username}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </header>
  );
}

async function ContactCard({ profile }: { profile: PersonProfileData }) {
  const t = await getTranslations("features.people.PersonProfile");
  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: t("email"),
      value: (
        <a href={`mailto:${profile.email}`} className="hover:underline">
          {profile.email}
        </a>
      ),
    },
  ];
  if (profile.location) rows.push({ label: t("location"), value: profile.location });
  if (profile.phone) {
    rows.push({
      label: t("phone"),
      value: (
        <a href={`tel:${profile.phone}`} className="hover:underline">
          {profile.phone}
        </a>
      ),
    });
  }
  const external: [string, string | null | undefined][] = [
    ["LinkedIn", profile.linkedinUrl],
    ["GitHub", profile.githubUrl],
    [t("website"), profile.websiteUrl],
  ];
  for (const [label, href] of external) {
    if (!href) continue;
    rows.push({
      label,
      value: (
        <a href={href} target="_blank" rel="noreferrer" className="hover:underline">
          {href.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      ),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("contact")}</CardTitle>
      </CardHeader>
      <CardContent>
        <InfoRows>
          {rows.map((row) => (
            <InfoRow key={row.label} label={row.label} value={row.value} />
          ))}
        </InfoRows>
      </CardContent>
    </Card>
  );
}

async function SpecialtiesCard({ profile }: { profile: PersonProfileData }) {
  const t = await getTranslations("features.people.PersonProfile");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("specialtiesAndLanguages")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.specialties && profile.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.specialties.map((s) => (
              <Badge key={s} variant="neutral" dot={false}>
                <Briefcase className="size-3" />
                {s}
              </Badge>
            ))}
          </div>
        )}
        {profile.languages && profile.languages.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.languages.map((l) => (
              <Badge key={l} variant="outline">
                {l}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
