"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  interviewModeLabel,
  interviewTypeLabel,
  type InterviewMode,
  type UpcomingInterviewItem,
} from "@/features/interviews/shared";
import {
  ArrowUpRightIcon,
  CalendarIcon,
  CaretLeftIcon,
  CaretRightIcon,
  FunnelIcon,
  MapPinIcon,
  PhoneIcon,
  VideoCameraIcon,
} from "@/components/ui/icons/phosphor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const MODE_ICON: Record<InterviewMode, React.ComponentType<{ className?: string }>> = {
  video: VideoCameraIcon,
  phone: PhoneIcon,
  onsite: MapPinIcon,
};

const MODE_TONE: Record<InterviewMode, string> = {
  video: "bg-pine/10 text-pine",
  phone: "bg-sage-ink/10 text-sage-ink",
  onsite: "bg-clay/10 text-clay",
};

const MAX_VISIBLE_PER_DAY = 3;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type FilterOption = { value: string; label: string };

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function buildMonthGrid(monthStart: Date): Date[] {
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function CalendarBoard({
  monthParam,
  monthLabel,
  interviews,
  jobOptions,
  interviewerOptions,
}: {
  monthParam: string;
  monthLabel: string;
  interviews: UpcomingInterviewItem[];
  jobOptions: FilterOption[];
  interviewerOptions: FilterOption[];
}) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [jobFilter, setJobFilter] = useState("all");
  const [interviewerFilter, setInterviewerFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selectedDay) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedDay]);

  const [year, month] = monthParam.split("-").map(Number);
  const grid = useMemo(() => buildMonthGrid(new Date(year, month - 1, 1)), [year, month]);
  const today = dayKey(new Date());

  const filtered = useMemo(() => {
    return interviews.filter((iv) => {
      if (jobFilter !== "all" && iv.jobId !== jobFilter) return false;
      if (interviewerFilter !== "all" && iv.interviewerId !== interviewerFilter)
        return false;
      if (typeFilter !== "all" && iv.type !== typeFilter) return false;
      return true;
    });
  }, [interviews, jobFilter, interviewerFilter, typeFilter]);

  const byDay = useMemo(() => {
    const map = new Map<string, UpcomingInterviewItem[]>();
    for (const iv of filtered) {
      const key = dayKey(new Date(iv.scheduledAt));
      const arr = map.get(key) ?? [];
      arr.push(iv);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    }
    return map;
  }, [filtered]);

  function goToMonth(offset: number) {
    const next = new Date(year, month - 1 + offset, 1);
    const param = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/dashboard/calendars?month=${param}`);
  }

  function goToday() {
    const now = new Date();
    const param = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/dashboard/calendars?month=${param}`);
  }

  const selectedDayInterviews = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const hasAnyFilter = jobFilter !== "all" || interviewerFilter !== "all" || typeFilter !== "all";
  const selectedDayHeading = useMemo(() => {
    if (!selectedDay) return "";
    const [y, m, d] = selectedDay.split("-").map(Number);
    return new Date(y, m, d).toLocaleDateString("en", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, [selectedDay]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filtered.length} interview{filtered.length === 1 ? "" : "s"} this
          month{hasAnyFilter ? " (filtered)" : ""}.
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]"
            aria-label="Previous month"
          >
            <CaretLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent active:scale-[0.97]"
          >
            {monthLabel}
          </button>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]"
            aria-label="Next month"
          >
            <CaretRightIcon className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/50 p-2.5">
        <FunnelIcon className="ml-1 size-4 text-muted-foreground" />
        <Select value={jobFilter} onValueChange={setJobFilter}>
          <SelectTrigger className="h-8 w-auto min-w-32 text-xs">
            <SelectValue placeholder="All jobs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            {jobOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={interviewerFilter} onValueChange={setInterviewerFilter}>
          <SelectTrigger className="h-8 w-auto min-w-36 text-xs">
            <SelectValue placeholder="All interviewers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All interviewers</SelectItem>
            {interviewerOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-auto min-w-28 text-xs">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="screening">Screening</SelectItem>
            <SelectItem value="culture_fit">Culture fit</SelectItem>
            <SelectItem value="technical">Technical</SelectItem>
            <SelectItem value="onsite">Onsite</SelectItem>
            <SelectItem value="final">Final round</SelectItem>
          </SelectContent>
        </Select>
        {hasAnyFilter ? (
          <button
            type="button"
            onClick={() => {
              setJobFilter("all");
              setInterviewerFilter("all");
              setTypeFilter("all");
            }}
            className="ml-auto text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Mobile: agenda list grouped by day (7-col grid is unreadable under sm) */}
      <div className="space-y-3 sm:hidden">
        {filtered.length === 0 ? null : (
          [...byDay.entries()]
            .sort(([a], [b]) => (a > b ? 1 : -1))
            .map(([key, dayInterviews]) => {
              const [y, m, d] = key.split("-").map(Number);
              const heading = new Date(y, m, d).toLocaleDateString("en", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              return (
                <div key={key} className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {heading}
                  </h3>
                  <div className="space-y-1.5">
                    {dayInterviews.map((iv) => {
                      const ModeIcon = MODE_ICON[iv.mode];
                      return (
                        <Link
                          key={iv.id}
                          href={`/dashboard/candidates/${iv.candidateId}`}
                          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-accent/60"
                        >
                          <span className="w-14 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                            {new Date(iv.scheduledAt).toLocaleTimeString("en", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                          <span
                            className={cn(
                              "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
                              MODE_TONE[iv.mode],
                            )}
                          >
                            <ModeIcon className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {iv.candidateName}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {interviewTypeLabel(iv.type)} · {iv.jobTitle}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={monthParam}
          initial={shouldReduceMotion ? false : { opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, x: -8 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="hidden overflow-hidden rounded-xl border border-border sm:block"
        >
          <div className="grid grid-cols-7 border-b border-border bg-muted/40" aria-hidden="true">
            {WEEKDAY_LABELS.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>
          <div
            className="grid grid-cols-7"
            role="grid"
            aria-label={`Interview calendar for ${monthLabel}`}
          >
            {grid.map((date) => {
              const key = dayKey(date);
              const dayInterviews = byDay.get(key) ?? [];
              const isCurrentMonth = date.getMonth() === month - 1;
              const isToday = key === today;
              const visible = dayInterviews.slice(0, MAX_VISIBLE_PER_DAY);
              const overflow = dayInterviews.length - visible.length;
              const dateLabel = date.toLocaleDateString("en", {
                weekday: "long",
                month: "long",
                day: "numeric",
              });

              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  aria-label={
                    dayInterviews.length > 0
                      ? `${dateLabel}, ${dayInterviews.length} interview${dayInterviews.length === 1 ? "" : "s"}${isToday ? ", today" : ""}`
                      : `${dateLabel}, no interviews${isToday ? ", today" : ""}`
                  }
                  aria-pressed={selectedDay === key}
                  onClick={() =>
                    dayInterviews.length > 0 &&
                    setSelectedDay(selectedDay === key ? null : key)
                  }
                  className={cn(
                    "flex min-h-24 flex-col items-stretch gap-1 border-b border-r border-border p-1.5 text-left transition-colors last:border-r-0",
                    !isCurrentMonth && "bg-muted/20 text-muted-foreground/50",
                    dayInterviews.length > 0 && "hover:bg-accent/60",
                    selectedDay === key && "bg-accent",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                      isToday && "bg-pine text-primary-foreground",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <div aria-hidden="true" className="flex flex-1 flex-col gap-1">
                    {visible.map((iv) => {
                      const ModeIcon = MODE_ICON[iv.mode];
                      return (
                        <span
                          key={iv.id}
                          className={cn(
                            "flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] font-medium",
                            MODE_TONE[iv.mode],
                          )}
                        >
                          <ModeIcon className="size-3 shrink-0" />
                          <span className="truncate">
                            {new Date(iv.scheduledAt).toLocaleTimeString("en", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}{" "}
                            {iv.candidateName}
                          </span>
                        </span>
                      );
                    })}
                    {overflow > 0 ? (
                      <span className="px-1.5 text-[11px] font-medium text-muted-foreground">
                        +{overflow} more
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {selectedDay ? (
          <motion.div
            ref={detailRef}
            initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
          >
            <Card>
              <CardContent className="space-y-2 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold tracking-tight">
                    {selectedDayHeading}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSelectedDay(null)}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Close
                  </button>
                </div>
                <div className="space-y-1.5">
                  {selectedDayInterviews.map((iv) => {
                    const ModeIcon = MODE_ICON[iv.mode];
                    const isExpanded = expandedId === iv.id;
                    const hasDetails = Boolean(
                      iv.location || iv.notes || iv.meetLink || iv.title,
                    );
                    return (
                      <div
                        key={iv.id}
                        className="rounded-lg border border-transparent transition-colors hover:border-border hover:bg-accent/60"
                      >
                        <div className="flex items-center gap-3 px-2 py-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : iv.id)
                            }
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            aria-expanded={isExpanded}
                          >
                            <span className="w-16 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                              {new Date(iv.scheduledAt).toLocaleTimeString("en", {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                            <span
                              className={cn(
                                "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
                                MODE_TONE[iv.mode],
                              )}
                            >
                              <ModeIcon className="size-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {iv.title || iv.candidateName}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {interviewTypeLabel(iv.type)} · {iv.jobTitle} ·{" "}
                                {interviewModeLabel(iv.mode)}
                              </span>
                            </span>
                            {iv.interviewerName ? (
                              <UserAvatar
                                name={iv.interviewerName}
                                src={iv.interviewerImage}
                                size="sm"
                                className="size-6 shrink-0 text-[10px]"
                              />
                            ) : null}
                            <Badge variant="neutral" className="shrink-0">
                              {iv.durationMins}m
                            </Badge>
                          </button>
                          <Link
                            href={`/dashboard/candidates/${iv.candidateId}`}
                            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                            title="Open candidate"
                          >
                            <ArrowUpRightIcon className="size-4" />
                          </Link>
                        </div>
                        <AnimatePresence initial={false}>
                          {isExpanded && hasDetails ? (
                            <motion.div
                              initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                              transition={{ duration: 0.15, ease: EASE_OUT }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-1.5 border-t border-border/60 px-2 py-2.5 pl-[4.75rem] text-xs text-muted-foreground">
                                <div>
                                  <span className="font-medium text-foreground">
                                    {iv.candidateName}
                                  </span>{" "}
                                  · {new Date(iv.scheduledAt).toLocaleDateString("en", {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </div>
                                {iv.location ? (
                                  <div className="flex items-center gap-1.5">
                                    <MapPinIcon className="size-3.5 shrink-0" />
                                    <span>{iv.location}</span>
                                  </div>
                                ) : null}
                                {iv.meetLink ? (
                                  <div className="flex items-center gap-1.5">
                                    <VideoCameraIcon className="size-3.5 shrink-0" />
                                    <a
                                      href={iv.meetLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="truncate text-pine hover:underline"
                                    >
                                      {iv.meetLink}
                                    </a>
                                  </div>
                                ) : null}
                                {iv.notes ? (
                                  <p className="whitespace-pre-wrap text-foreground/80">
                                    {iv.notes}
                                  </p>
                                ) : null}
                                {iv.gcalEventId ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(
                                        `https://calendar.google.com/calendar/r/search?q=${encodeURIComponent(iv.gcalEventId!)}`,
                                        "_blank",
                                        "noopener,noreferrer",
                                      );
                                    }}
                                    className="inline-flex items-center gap-1 text-foreground/80 transition-colors hover:text-foreground"
                                  >
                                    View in Google Calendar
                                    <ArrowUpRightIcon className="size-3" />
                                  </button>
                                ) : null}
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarIcon className="size-10 text-muted-foreground" />
            <p className="text-sm font-medium">No interviews this month</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {hasAnyFilter
                ? "Try clearing a filter, or schedule one from a candidate's profile."
                : "Schedule an interview from a candidate's profile to see it here."}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
