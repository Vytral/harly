"use client";

import type { ReactNode } from "react";
import { Globe, Mail, Phone } from "lucide-react";

import { GithubIcon } from "@/components/ui/icons/GithubIcon";
import { LinkedinLogo } from "@/components/ui/icons/brands";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RedactLink } from "@/features/candidates/IdentityShield";

function ContactIconLink({
  href,
  label,
  external = false,
  children,
}: {
  href: string;
  label: string;
  external?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <RedactLink
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
            className="inline-flex size-8 items-center justify-center rounded-[var(--radius-btn)] text-soft-ink outline-none transition-colors duration-150 hover:bg-card-inset hover:text-near-ink focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {children}
            <span className="sr-only">{label}</span>
          </RedactLink>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Compact icon links (mail, phone, LinkedIn, GitHub, website). Tooltips carry
 * only the generic label so nothing identifying leaks while the identity
 * shield is masking the candidate.
 */
export function CandidateContactLinks({
  email,
  phone,
  linkedinUrl,
  githubUrl,
  websiteUrl,
}: {
  email: string;
  phone: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-0.5">
        {email ? (
          <ContactIconLink href={`mailto:${email}`} label="Email">
            <Mail className="size-4" strokeWidth={1.6} />
          </ContactIconLink>
        ) : null}
        {phone ? (
          <ContactIconLink href={`tel:${phone}`} label="Phone">
            <Phone className="size-4" strokeWidth={1.6} />
          </ContactIconLink>
        ) : null}
        {linkedinUrl ? (
          <ContactIconLink href={linkedinUrl} label="LinkedIn" external>
            <LinkedinLogo className="size-4" />
          </ContactIconLink>
        ) : null}
        {githubUrl ? (
          <ContactIconLink href={githubUrl} label="GitHub" external>
            <GithubIcon className="size-4" />
          </ContactIconLink>
        ) : null}
        {websiteUrl ? (
          <ContactIconLink href={websiteUrl} label="Website" external>
            <Globe className="size-4" strokeWidth={1.6} />
          </ContactIconLink>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
