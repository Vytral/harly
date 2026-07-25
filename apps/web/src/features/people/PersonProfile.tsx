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

  return (
    <div className="space-y-6">
      <Link
        href={"/people" as Route}
        className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to People
      </Link>

      <PersonHeader profile={profile} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
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
          ) : !hasAbout ? (
            <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
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
          ) : null}
        </div>

        <div className="space-y-6">
          <ContactCard profile={profile} />
          {(profile.specialties?.length || profile.languages?.length) && (
            <SpecialtiesCard profile={profile} />
          )}
          <PersonAvailabilityCard
            timezone={profile.timezone}
            weeklyAvailability={profile.weeklyAvailability}
            capacityHoursPerWeek={profile.capacityHoursPerWeek}
          />
        </div>
      </div>
    </div>
  );
}

function PersonHeader({ profile }: { profile: PersonProfileData }) {
  return (
    <div className="flex flex-col items-start gap-4 border-b pb-6 sm:flex-row sm:items-center">
      <UserAvatar name={profile.name} src={profile.image} size="xl" />
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{profile.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {profile.jobTitle && <span>{profile.jobTitle}</span>}
          {profile.username && (
            <span className="text-muted-foreground/70">
              @{profile.username}
            </span>
          )}
        </div>
        {profile.location && (
          <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5" />
            {profile.location}
          </div>
        )}
      </div>
    </div>
  );
}

function ContactCard({ profile }: { profile: PersonProfileData }) {
  const links = [
    { icon: Mail, label: profile.email, href: `mailto:${profile.email}` },
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
            className="flex items-center gap-2 rounded-sm text-sm outline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
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
