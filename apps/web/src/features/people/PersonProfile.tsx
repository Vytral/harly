import Link from "next/link";
import type { Route } from "next";
import {
  ArrowLeft,
  Briefcase,
  Globe,
  Mail,
  MapPin,
  Phone,
  UserRoundX,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GithubIcon } from "@/components/ui/icons/GithubIcon";
import { LinkedinLogo } from "@/components/ui/icons/brands";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type {
  PersonJobRow,
  PersonProfile as PersonProfileData,
} from "@/features/people/actions";
import { PersonAvailabilityCard } from "@/features/people/PersonAvailabilityCard";
import { PersonJobsSection } from "@/features/people/PersonJobsSection";

export function PersonProfile({
  profile,
  jobs,
}: {
  profile: PersonProfileData;
  jobs: PersonJobRow[];
}) {
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
        className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-offset-4 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to People
      </Link>

      <PersonHeader profile={profile} />

      <div
        className={
          hasSidebar
            ? "grid items-start gap-6 lg:grid-cols-[1fr_320px]"
            : "grid items-start gap-6"
        }
      >
        <div className="space-y-6">
          {hasAbout && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  About
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {profile.bio}
                </p>
              </CardContent>
            </Card>
          )}

          {hasJobs ? (
            <PersonJobsSection jobs={jobs} />
          ) : mainColumnEmpty ? (
            <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-3xl border border-dashed bg-card px-6 py-12 text-center">
              <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <UserRoundX className="size-5" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">
                Nothing here yet
              </h2>
              <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
                {profile.name} hasn&apos;t added a bio and isn&apos;t on any
                jobs or hiring teams yet.
              </p>
            </div>
          ) : (
            // Bio present but no jobs: keep the column from collapsing into a
            // lonely card by showing a quiet "on no jobs yet" note.
            <div className="rounded-3xl border border-dashed bg-card px-5 py-6 text-center text-sm text-muted-foreground">
              Not on any jobs or hiring teams yet.
            </div>
          )}
        </div>

        {hasSidebar && (
          <div className="space-y-6">
            <ContactCard profile={profile} />
            {hasSpecialties && <SpecialtiesCard profile={profile} />}
            <PersonAvailabilityCard
              timezone={profile.timezone}
              weeklyAvailability={profile.weeklyAvailability}
              capacityHoursPerWeek={profile.capacityHoursPerWeek}
            />
          </div>
        )}
      </div>

      <NothingElseFooter />
    </div>
  );
}

/** A quiet end-of-page marker so sparse profiles don't trail into blank space. */
function NothingElseFooter() {
  return (
    <div className="flex flex-col items-center gap-1.5 pt-2 pb-6 text-center">
      <div className="h-px w-10 bg-border" />
      <p className="text-xs text-muted-foreground/70">
        Nothing else to see here.
      </p>
    </div>
  );
}

function PersonHeader({ profile }: { profile: PersonProfileData }) {
  return (
    <div className="flex flex-col items-start gap-4 border-b pb-6 sm:flex-row sm:items-center">
      <UserAvatar name={profile.name} src={profile.image} size="xl" />
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{profile.name}</h1>
        {profile.username && (
          <p className="mt-0.5 text-sm text-muted-foreground/70">
            @{profile.username}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {profile.jobTitle && <span>{profile.jobTitle}</span>}
          {profile.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {profile.location}
            </span>
          )}
          <a
            href={`mailto:${profile.email}`}
            className="flex items-center gap-1.5 rounded-sm outline-offset-4 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Mail className="size-3.5" />
            {profile.email}
          </a>
        </div>
      </div>
    </div>
  );
}

function ContactCard({ profile }: { profile: PersonProfileData }) {
  // Email lives in the header; this card only surfaces the *other* channels so
  // it never renders as a lonely duplicate of the address up top.
  const links = [
    profile.phone && {
      icon: Phone,
      label: profile.phone,
      href: `tel:${profile.phone}`,
    },
    profile.linkedinUrl && {
      icon: LinkedinLogo,
      label: "LinkedIn",
      href: profile.linkedinUrl,
    },
    profile.githubUrl && {
      icon: GithubIcon,
      label: "GitHub",
      href: profile.githubUrl,
    },
    profile.websiteUrl && {
      icon: Globe,
      label: "Website",
      href: profile.websiteUrl,
    },
  ].filter(Boolean) as { icon: typeof Mail; label: string; href: string }[];

  if (links.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Contact
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target={link.href.startsWith("http") ? "_blank" : undefined}
            rel={link.href.startsWith("http") ? "noreferrer" : undefined}
            className="flex items-center gap-2 rounded-sm text-sm outline-offset-4 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <link.icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{link.label}</span>
          </a>
        ))}
      </CardContent>
    </Card>
  );
}

function SpecialtiesCard({ profile }: { profile: PersonProfileData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Specialties & languages
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.specialties && profile.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.specialties.map((s) => (
              <Badge key={s} variant="secondary">
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
