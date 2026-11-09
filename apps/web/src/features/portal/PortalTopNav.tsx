"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { useEffect, useState, type ReactNode } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import {
  HouseIcon,
  BellIcon,
  UserCircleIcon,
  BriefcaseIcon,
  FileTextIcon,
} from "@/components/ui/icons/phosphor";
import { headerCornerBadge, headerRoundButton } from "@/components/dashboard/header-styles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PortalTopNavProps = {
  orgName: string;
  orgLogo: string | null;
  orgFullLogoUrl: string | null;
  orgFullLogoDarkUrl: string | null;
  orgColor: string | null;
  candidateName: string;
  candidateInitials: string;
  candidateAvatarUrl: string | null;
  unreadNotificationCount: number;
  signOutForm: ReactNode;
};

const NAV_ITEMS = [
  { href: "/portal/dashboard" as Route, label: "home", icon: HouseIcon },
  { href: "/portal/applications" as Route, label: "applications", icon: FileTextIcon },
  { href: "/portal/jobs" as Route, label: "openRoles", icon: BriefcaseIcon },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** White pill that glides between tabs; a plain swap when motion is reduced. */
function ActivePill() {
  const reduce = useReducedMotion();
  return (
    <motion.span
      layoutId="portal-active-pill"
      aria-hidden="true"
      transition={reduce ? { duration: 0 } : spring.pill}
      className="absolute inset-0 rounded-full bg-pure-snow shadow-[var(--shadow-card)] dark:bg-soft-kraft"
    />
  );
}

function OrgMark({
  orgName,
  orgLogo,
  orgFullLogoUrl,
  orgFullLogoDarkUrl,
  accent,
}: {
  orgName: string;
  orgLogo: string | null;
  orgFullLogoUrl: string | null;
  orgFullLogoDarkUrl: string | null;
  accent: string;
}) {
  const t = useTranslations("portal.nav");
  if (orgFullLogoUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- external URL from workspace */}
        <img
          src={orgFullLogoUrl}
          alt={orgName}
          className={cn("h-7 max-w-[150px] object-contain", orgFullLogoDarkUrl && "dark:hidden")}
        />
        {orgFullLogoDarkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external URL from workspace
          <img src={orgFullLogoDarkUrl} alt={orgName} className="hidden h-7 max-w-[150px] object-contain dark:block" />
        ) : null}
      </>
    );
  }
  return (
    <>
      {orgLogo ? (
        // eslint-disable-next-line @next/next/no-img-element -- external URL from workspace
        <img src={orgLogo} alt="" className="size-8 rounded-lg object-cover" />
      ) : (
        <span
          className="flex size-8 items-center justify-center rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: accent }}
          aria-hidden="true"
        >
          {orgName.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-near-ink">
        {orgName}
        <span className="ml-1.5 font-normal text-soft-ink max-sm:hidden">{t("careers")}</span>
      </span>
    </>
  );
}

export function PortalTopNav({
  orgName,
  orgLogo,
  orgFullLogoUrl,
  orgFullLogoDarkUrl,
  orgColor,
  candidateName,
  candidateInitials,
  candidateAvatarUrl,
  unreadNotificationCount,
  signOutForm,
}: PortalTopNavProps) {
  const t = useTranslations("portal.nav");
  const pathname = usePathname();
  const accent = orgColor ?? "#3f6212";
  const unread = unreadNotificationCount;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div
        data-scrolled={scrolled || undefined}
        className="sticky top-0 z-40 border-b border-transparent transition-[background-color,border-color] duration-[var(--motion-base)] ease-out data-[scrolled]:border-hairline data-[scrolled]:bg-warm-paper/85 data-[scrolled]:backdrop-blur-md"
      >
        <header className="mx-auto grid h-16 max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <Link
            href={"/portal/dashboard" as Route}
            className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
          >
            <OrgMark
              orgName={orgName}
              orgLogo={orgLogo}
              orgFullLogoUrl={orgFullLogoUrl}
              orgFullLogoDarkUrl={orgFullLogoDarkUrl}
              accent={accent}
            />
          </Link>

          <nav aria-label={t("portal")} className="hidden md:block">
            <LayoutGroup id="portal-pills">
              <ul className="flex items-center gap-1 rounded-full bg-pure-snow/40 p-1 dark:bg-soft-kraft/30">
                {NAV_ITEMS.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[14px] font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
                          active ? "text-near-ink" : "text-soft-ink hover:text-near-ink",
                        )}
                      >
                        {active ? <ActivePill /> : null}
                        <item.icon className="relative size-[18px]" />
                        <span className="relative">{t(item.label)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </LayoutGroup>
          </nav>

          <div className="flex items-center justify-end gap-2">
            <Link
              href={"/portal/notifications" as Route}
              aria-label={unread > 0 ? t("unreadNotifications", { count: unread }) : t("notifications")}
              className={cn(headerRoundButton, "max-md:hidden", isActive(pathname, "/portal/notifications") && "bg-pure-snow text-near-ink")}
            >
              <BellIcon className="size-[18px]" />
              {unread > 0 ? <span className={headerCornerBadge}>{unread > 99 ? "99+" : unread}</span> : null}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("account")}
                className="flex items-center rounded-full outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-near-ink focus-visible:ring-offset-2"
              >
                {candidateAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external URL
                  <img src={candidateAvatarUrl} alt="" className="size-9 rounded-full object-cover ring-1 ring-hairline" />
                ) : (
                  <span className="flex size-9 items-center justify-center rounded-full bg-near-ink text-[13px] font-semibold text-pure-snow">
                    {candidateInitials}
                  </span>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium text-foreground">{candidateName}</p>
                  <p className="text-xs text-muted-foreground">{t("candidateAt", { orgName })}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={"/portal/profile" as Route}>
                    <UserCircleIcon className="size-4" />
                    {t("profilePrivacy")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={"/portal/notifications" as Route}>
                    <BellIcon className="size-4" />
                    {t("notifications")}
                    {unread > 0 ? <span className="ml-auto text-xs tabular-nums text-soft-ink">{unread}</span> : null}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="p-0">
                  {signOutForm}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
      </div>

      <PortalTabBar pathname={pathname} unread={unread} />
    </>
  );
}

/** Phone and small tablet: a bottom tab bar, thumb-reachable, above the home indicator. */
function PortalTabBar({ pathname, unread }: { pathname: string; unread: number }) {
  const t = useTranslations("portal.nav");
  const items = [
    ...NAV_ITEMS.map((item) => ({ ...item, label: item.label === "openRoles" ? "roles" as const : item.label, badge: 0 })),
    { href: "/portal/notifications" as Route, label: "updates" as const, icon: BellIcon, badge: unread },
  ];
  return (
    <nav
      aria-label={t("portal")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-warm-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-150 [-webkit-tap-highlight-color:transparent] active:scale-95",
                  active ? "text-near-ink" : "text-soft-ink",
                )}
              >
                <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200", active && "bg-lime-wash")}>
                  <item.icon className="size-5" />
                  {item.badge > 0 ? (
                    <span className="absolute right-1.5 top-0.5 size-2 rounded-full bg-chartreuse-signal ring-2 ring-warm-paper" aria-hidden="true" />
                  ) : null}
                </span>
                {t(item.label)}
                {item.badge > 0 ? <span className="sr-only">{t("unreadSuffix", { count: item.badge })}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
