"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Globe, Mail, Phone } from "lucide-react";

import { GithubIcon } from "@/components/ui/icons/GithubIcon";
import { LinkedinLogo } from "@/components/ui/icons/brands";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RedactLink } from "@/features/candidates/IdentityShield";

function ContactLink({
  href,
  label,
  value,
  external = false,
  children,
}: {
  href: string;
  label: string;
  value?: string;
  external?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex min-w-0 max-w-full">
          <RedactLink
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
            className={cn(
              "inline-flex items-center justify-center rounded-[var(--radius-btn)] text-soft-ink outline-none transition-colors duration-150 hover:bg-card-inset hover:text-near-ink focus-visible:ring-[3px] focus-visible:ring-ring/50",
              value ? "min-h-8 max-w-full gap-2 px-2 py-1 text-sm" : "size-8",
            )}
          >
            {children}
            <span className="sr-only">{label}{value ? ": " : ""}</span>
            {value ? <span className="min-w-0 break-all">{value}</span> : null}
          </RedactLink>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Email and phone values are visible alongside icons; social links stay compact. Tooltips carry
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
  const t = useTranslations("features.candidates.contactLinks");
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-0.5">
        {email ? (
          <ContactLink href={`mailto:${email}`} label={t("email")} value={email}>
            <Mail className="size-4 shrink-0" strokeWidth={1.6} />
          </ContactLink>
        ) : null}
        {phone ? (
          <ContactLink href={`tel:${phone}`} label={t("phone")} value={phone}>
            <Phone className="size-4 shrink-0" strokeWidth={1.6} />
          </ContactLink>
        ) : null}
        {linkedinUrl ? (
          <ContactLink href={linkedinUrl} label="LinkedIn" external>
            <LinkedinLogo className="size-4 shrink-0" />
          </ContactLink>
        ) : null}
        {githubUrl ? (
          <ContactLink href={githubUrl} label="GitHub" external>
            <GithubIcon className="size-4 shrink-0" />
          </ContactLink>
        ) : null}
        {websiteUrl ? (
          <ContactLink href={websiteUrl} label={t("website")} external>
            <Globe className="size-4 shrink-0" strokeWidth={1.6} />
          </ContactLink>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
