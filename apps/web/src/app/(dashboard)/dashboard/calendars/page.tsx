import { CalendarDays } from "lucide-react";

import { ComingSoon } from "@/components/ComingSoon";

export default function CalendarsPage() {
  return (
    <ComingSoon
      icon={CalendarDays}
      title="Calendars"
      description="Connect Google or Outlook to schedule and track interviews without leaving OpenHire."
    />
  );
}
