import { Star, Users } from "lucide-react";

/** Small pill for CandidatesTable rows / candidate profile header. */
export function ReferralBadge({ featured }: { featured: boolean }) {
  if (featured) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-clay/10 px-1.5 py-0.5 text-[11px] font-semibold text-warning-clay">
        <Star className="size-3 fill-current" />
        Featured referral
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
      <Users className="size-3" />
      Referred
    </span>
  );
}
