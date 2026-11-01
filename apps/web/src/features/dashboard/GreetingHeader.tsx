import { UserAvatar } from "@/components/ui/UserAvatar";

/**
 * Home's identity moment (DESIGN.md , Morning Greeting Header).
 *
 * Avatar + "Good morning, {First}!" at greeting scale, and one short
 * operational subline. Deliberately not the old header: no waving emoji, no
 * "Let's go!", no date stamp in the corner competing for the eye. In a
 * GDPR-ready hiring tool that tone reads as a toy , and the frame's greeting is
 * a single calm line.
 */
export function GreetingHeader({
  name,
  avatarUrl,
  hour,
  subline,
}: {
  name: string;
  avatarUrl: string | null;
  hour: number;
  subline: string;
}) {
  return (
    <header className="flex items-center gap-3 pt-4">
      <UserAvatar name={name} src={avatarUrl} size="md" priority />
      <div className="min-w-0">
        <h1 className="font-display truncate text-[24px] leading-tight text-near-ink">
          {greeting(hour)}, {name}!
        </h1>
        <p className="mt-0.5 text-[13px] text-soft-ink">{subline}</p>
      </div>
    </header>
  );
}

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Operational, countable, and never cheerful about an empty pipeline. Every
 * number is a real total: the same ones the cards and their destinations show.
 */
export function buildSubline({
  toReview,
  waitingOverWeek,
  interviewsToday,
}: {
  toReview: number;
  /** Reviews that have waited more than a week. */
  waitingOverWeek: number;
  interviewsToday: number;
}) {
  const parts: string[] = [];

  if (toReview > 0) {
    parts.push(`${toReview} ${toReview === 1 ? "candidate" : "candidates"} to review`);
  }
  if (waitingOverWeek > 0) {
    parts.push(`${waitingOverWeek} waiting over a week`);
  }
  if (interviewsToday > 0) {
    parts.push(
      `${interviewsToday} ${interviewsToday === 1 ? "interview" : "interviews"} today`,
    );
  }

  if (parts.length === 0) return "Nothing needs a decision right now.";
  return `${parts.join(" · ")}.`;
}
