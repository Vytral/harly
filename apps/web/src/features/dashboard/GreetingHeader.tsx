import { useTranslations } from "next-intl";

import { UserAvatar } from "@/components/ui/UserAvatar";

type Translator = ReturnType<typeof useTranslations>;

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
  const t = useTranslations("shell.homeGreeting");
  return (
    <header className="flex items-center gap-3 pt-4">
      <UserAvatar name={name} src={avatarUrl} size="md" priority />
      <div className="min-w-0">
        <h1 className="font-display truncate text-[24px] leading-tight text-near-ink">
          {t(greetingPeriod(hour), { name })}
        </h1>
        <p className="mt-0.5 text-[13px] text-soft-ink">{subline}</p>
      </div>
    </header>
  );
}

function greetingPeriod(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/**
 * Operational, countable, and never cheerful about an empty pipeline. Every
 * number is a real total: the same ones the cards and their destinations show.
 */
export function buildSubline({
  t,
  toReview,
  waitingOverWeek,
  interviewsToday,
}: {
  /** Translator for `shell.homePage`. */
  t: Translator;
  toReview: number;
  /** Reviews that have waited more than a week. */
  waitingOverWeek: number;
  interviewsToday: number;
}) {
  const parts: string[] = [];

  if (toReview > 0) {
    parts.push(t("reviewCount", { count: toReview }));
  }
  if (waitingOverWeek > 0) {
    parts.push(t("waitingCount", { count: waitingOverWeek }));
  }
  if (interviewsToday > 0) {
    parts.push(t("interviewCount", { count: interviewsToday }));
  }

  if (parts.length === 0) return t("nothingPending");
  return t("summary", { summary: parts.join(" · ") });
}
