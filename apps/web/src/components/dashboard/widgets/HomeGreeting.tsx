function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Home's identity moment: one centered display line and a single operational
 * subline. No emoji, no date stamp; the calm tone is deliberate for an HR tool.
 */
export function HomeGreeting({
  name,
  hour,
  subline,
}: {
  name: string;
  hour: number;
  subline: string;
}) {
  return (
    <header className="px-4 pb-2 pt-6 text-center sm:pt-8">
      <h1 className="font-display text-balance text-[32px] leading-[1.1] text-near-ink sm:text-[40px]">
        {greeting(hour)}, {name}
      </h1>
      <p className="mx-auto mt-2 max-w-xl text-pretty text-[14px] text-soft-ink">
        {subline}
      </p>
    </header>
  );
}
