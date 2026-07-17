import "server-only";

import type { Metadata } from "next";

import type { CareerPageConfig } from "./config";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import type { Job } from "@harly/db";

function origin() {
  return (process.env.HARLY_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function plainText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function boardUrl(workspaceSlug: string) {
  return `${origin()}/board/${workspaceSlug}`;
}

function robots(indexable: boolean) {
  return indexable ? { index: true, follow: true } : { index: false, follow: true };
}

export function publicBoardMetadata(workspace: WorkspaceBoardBranding, config: CareerPageConfig): Metadata {
  const url = boardUrl(workspace.slug);
  const title = config.seo.title || `${workspace.name} careers`;
  const description = config.seo.description || workspace.description || workspace.tagline || `Explore open roles at ${workspace.name}.`;
  const image = config.seo.socialImageUrl ?? config.hero.imageUrl ?? workspace.heroImageUrl ?? workspace.logoUrl ?? undefined;

  return {
    title,
    description,
    robots: robots(config.seo.indexable),
    alternates: { canonical: url },
    icons: config.seo.faviconUrl ? { icon: config.seo.faviconUrl } : undefined,
    openGraph: { type: "website", url, title, description, siteName: workspace.name, images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}

export function publicJobMetadata(workspace: WorkspaceBoardBranding, config: CareerPageConfig, job: Job): Metadata {
  const url = `${boardUrl(workspace.slug)}/jobs/${job.slug}`;
  const title = `${job.title} at ${workspace.name}`;
  const description = plainText(job.description).slice(0, 180) || `Apply for ${job.title} at ${workspace.name}.`;
  const image = config.seo.socialImageUrl ?? config.hero.imageUrl ?? workspace.heroImageUrl ?? workspace.logoUrl ?? undefined;
  return {
    title,
    description,
    robots: robots(config.seo.indexable),
    alternates: { canonical: url },
    icons: config.seo.faviconUrl ? { icon: config.seo.faviconUrl } : undefined,
    openGraph: { type: "website", url, title, description, siteName: workspace.name, images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}

export function jobPostingJsonLd(workspace: WorkspaceBoardBranding, job: Job) {
  const employmentType: Record<Job["employmentType"], string> = {
    full_time: "FULL_TIME", part_time: "PART_TIME", contract: "CONTRACTOR", internship: "INTERN",
  };
  const posting: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: (job.publishedAt ?? job.createdAt).toISOString(),
    employmentType: employmentType[job.employmentType],
    hiringOrganization: { "@type": "Organization", name: workspace.name, sameAs: workspace.websiteUrl ?? undefined, logo: workspace.logoUrl ?? undefined },
  };
  if (job.validThrough) posting.validThrough = job.validThrough.toISOString();
  if (job.workplaceType === "remote") {
    posting.jobLocationType = "TELECOMMUTE";
    const countries = Array.isArray(job.remoteEligibleCountries) ? job.remoteEligibleCountries.filter((value): value is string => typeof value === "string") : [];
    if (countries.length) posting.applicantLocationRequirements = countries.map((addressCountry) => ({ "@type": "Country", addressCountry }));
  } else if (job.location || job.jobLocationCountry) {
    posting.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location ?? undefined, addressRegion: job.jobLocationRegion ?? undefined, addressCountry: job.jobLocationCountry ?? undefined } };
  }
  if (job.salaryMin != null && job.salaryMax != null && job.currency && job.salaryPeriod) {
    posting.baseSalary = { "@type": "MonetaryAmount", currency: job.currency, value: { "@type": "QuantitativeValue", minValue: job.salaryMin, maxValue: job.salaryMax, unitText: job.salaryPeriod === "annual" ? "YEAR" : "MONTH" } };
  }
  return posting;
}

export { boardUrl };
