export type PortalProfileCompletionInput = {
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  phone: string | null;
  location: string | null;
  avatarUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
};

export type PortalProfileCompletion = {
  percentage: number;
  completed: number;
  total: number;
  missing: string[];
};

export function getPortalProfileCompletion(
  profile: PortalProfileCompletionInput,
): PortalProfileCompletion {
  const checks = [
    {
      label: "Full name",
      complete: Boolean(profile.firstName?.trim() && profile.lastName?.trim()),
    },
    {
      label: "Professional headline",
      complete: Boolean(profile.headline?.trim()),
    },
    { label: "Phone", complete: Boolean(profile.phone?.trim()) },
    { label: "Location", complete: Boolean(profile.location?.trim()) },
    { label: "Profile photo", complete: Boolean(profile.avatarUrl?.trim()) },
    { label: "LinkedIn", complete: Boolean(profile.linkedinUrl?.trim()) },
    {
      label: "GitHub or website",
      complete: Boolean(
        profile.githubUrl?.trim() || profile.websiteUrl?.trim(),
      ),
    },
  ];
  const completed = checks.filter((item) => item.complete).length;

  return {
    percentage: Math.round((completed / checks.length) * 100),
    completed,
    total: checks.length,
    missing: checks.filter((item) => !item.complete).map((item) => item.label),
  };
}
