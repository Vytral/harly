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

export type PortalProfileField = "fullName" | "headline" | "phone" | "location" | "photo" | "linkedin" | "onlineProfile";

export type PortalProfileCompletion = {
  percentage: number;
  completed: number;
  total: number;
  missing: PortalProfileField[];
};

export function getPortalProfileCompletion(
  profile: PortalProfileCompletionInput,
): PortalProfileCompletion {
  const checks: { label: PortalProfileField; complete: boolean }[] = [
    {
      label: "fullName",
      complete: Boolean(profile.firstName?.trim() && profile.lastName?.trim()),
    },
    {
      label: "headline",
      complete: Boolean(profile.headline?.trim()),
    },
    { label: "phone", complete: Boolean(profile.phone?.trim()) },
    { label: "location", complete: Boolean(profile.location?.trim()) },
    { label: "photo", complete: Boolean(profile.avatarUrl?.trim()) },
    { label: "linkedin", complete: Boolean(profile.linkedinUrl?.trim()) },
    {
      label: "onlineProfile",
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
