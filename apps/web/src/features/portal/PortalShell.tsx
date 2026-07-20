"use client";

import type { ReactNode } from "react";
import { PortalTopNav } from "./PortalTopNav";
import { PortalFooter } from "./PortalFooter";
import type { CareerSocialLink } from "@/features/career-page/config";

type PortalShellClientProps = {
  children: ReactNode;
  orgName: string;
  orgLogo: string | null;
  orgFullLogoUrl: string | null;
  orgFullLogoDarkUrl: string | null;
  orgColor: string | null;
  candidateName: string;
  candidateInitials: string;
  candidateAvatarUrl: string | null;
  unreadNotificationCount: number;
  signOutForm: ReactNode;
  socials: CareerSocialLink[];
  legalLinks: string[];
  year: number;
};

export function PortalShellClient({
  children,
  orgName,
  orgLogo,
  orgFullLogoUrl,
  orgFullLogoDarkUrl,
  orgColor,
  candidateName,
  candidateInitials,
  candidateAvatarUrl,
  unreadNotificationCount,
  signOutForm,
  socials,
  legalLinks,
  year,
}: PortalShellClientProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PortalTopNav
        orgName={orgName}
        orgLogo={orgLogo}
        orgFullLogoUrl={orgFullLogoUrl}
        orgFullLogoDarkUrl={orgFullLogoDarkUrl}
        orgColor={orgColor}
        candidateName={candidateName}
        candidateInitials={candidateInitials}
        candidateAvatarUrl={candidateAvatarUrl}
        unreadNotificationCount={unreadNotificationCount}
        signOutForm={signOutForm}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
      <PortalFooter
        orgName={orgName}
        orgLogo={orgLogo}
        orgFullLogoUrl={orgFullLogoUrl}
        orgFullLogoDarkUrl={orgFullLogoDarkUrl}
        orgColor={orgColor}
        socials={socials}
        legalLinks={legalLinks}
        year={year}
      />
    </div>
  );
}
