"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  HouseIcon,
  BellIcon,
  UserCircleIcon,
  BriefcaseIcon,
} from "@/components/ui/icons/phosphor";
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
  { href: "/portal/dashboard" as Route, label: "Home", icon: HouseIcon },
  { href: "/portal/notifications" as Route, label: "Notifications", icon: BellIcon },
  { href: "/portal/jobs" as Route, label: "Jobs", icon: BriefcaseIcon },
];

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
  const pathname = usePathname();
  const accentColor = orgColor ?? "#3f6212";
  const hasUnread = unreadNotificationCount > 0;

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href={"/portal/dashboard" as Route} className="flex items-center gap-2.5">
          {orgFullLogoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- external URL from workspace */}
              <img
                src={orgFullLogoUrl}
                alt={orgName}
                className={cn("h-8 max-w-[160px] object-contain", orgFullLogoDarkUrl && "dark:hidden")}
              />
              {orgFullLogoDarkUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- external URL from workspace
                <img
                  src={orgFullLogoDarkUrl}
                  alt={orgName}
                  className="hidden h-8 max-w-[160px] object-contain dark:block"
                />
              )}
            </>
          ) : orgLogo ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- external URL from workspace */}
              <img
                src={orgLogo}
                alt={orgName}
                className="size-9 rounded-lg object-cover"
              />
              <span className="font-display text-lg font-semibold tracking-tight text-foreground">
                {orgName}
              </span>
            </>
          ) : (
            <>
              <span
                className="flex size-9 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{ backgroundColor: accentColor }}
              >
                {orgName.charAt(0).toUpperCase()}
              </span>
              <span className="font-display text-lg font-semibold tracking-tight text-foreground">
                {orgName}
              </span>
            </>
          )}
        </Link>

        {/* Center nav */}
        <div className="hidden sm:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right side: bell + avatar dropdown */}
        <div className="flex items-center gap-2">
          {/* Notifications bell (transparent) with unread dot */}
          <Link
            href={"/portal/notifications" as Route}
            aria-label={
              hasUnread
                ? `Notifications, ${unreadNotificationCount} unread`
                : "Notifications"
            }
            className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <BellIcon className="size-5" />
            {hasUnread && (
              <span className="absolute right-2 top-2 size-2 rounded-full bg-rust ring-2 ring-background" />
            )}
          </Link>

          {/* Avatar dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center rounded-full outline-none ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {candidateAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external URL
                <img
                  src={candidateAvatarUrl}
                  alt={candidateName}
                  className="size-9 rounded-full object-cover ring-2 ring-border"
                />
              ) : (
                <div
                  className="flex size-9 items-center justify-center rounded-full text-sm font-semibold text-white ring-2 ring-border"
                  style={{ backgroundColor: accentColor }}
                >
                  {candidateInitials}
                </div>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium text-foreground">{candidateName}</p>
                <p className="text-xs text-muted-foreground">Candidate</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={"/portal/dashboard" as Route}>
                  <BriefcaseIcon className="size-4" />
                  My applications
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={"/portal/profile" as Route}>
                  <UserCircleIcon className="size-4" />
                  My profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={"/portal/notifications" as Route}>
                  <BellIcon className="size-4" />
                  Notifications
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="p-0">
                {signOutForm}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
