"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Route } from "next";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  HouseIcon,
  UserCircleIcon,
  BriefcaseIcon,
  BellIcon,
  CaretDownIcon,
  HamburgerIcon,
  XIcon,
} from "@/components/ui/icons/phosphor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  href: Route;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/portal/dashboard" as Route, label: "Home", icon: HouseIcon, match: "/portal/dashboard" },
  { href: "/portal/jobs" as Route, label: "Jobs", icon: BriefcaseIcon, match: "/portal/jobs" },
  { href: "/portal/notifications" as Route, label: "Notifications", icon: BellIcon, match: "/portal/notifications" },
  { href: "/portal/profile" as Route, label: "Profile", icon: UserCircleIcon, match: "/portal/profile" },
];

type PortalShellClientProps = {
  children: ReactNode;
  orgName: string;
  orgLogo: string | null;
  orgFullLogoUrl: string | null;
  orgFullLogoDarkUrl: string | null;
  orgColor: string | null;
  candidateName: string;
  candidateInitials: string;
  candidateAvatarUrl?: string | null;
  signOutForm: ReactNode;
};

export function PortalShellClient({
  children,
  orgName,
  orgLogo,
  orgFullLogoUrl,
  orgFullLogoDarkUrl,
  orgColor,
  candidateName,
  candidateInitials,
  candidateAvatarUrl,
  signOutForm,
}: PortalShellClientProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const accentColor = orgColor ?? "#18181b";

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top Navigation ── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* Left: Org logo + name */}
          <Link
            href={"/portal/dashboard" as Route}
            className="flex shrink-0 items-center gap-2.5"
          >
            {orgFullLogoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- external URL from workspace */}
                <img
                  src={orgFullLogoUrl}
                  alt={orgName}
                  className={cn("h-8 w-auto object-contain", orgFullLogoDarkUrl && "dark:hidden")}
                />
                {orgFullLogoDarkUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- external URL from workspace
                  <img
                    src={orgFullLogoDarkUrl}
                    alt={orgName}
                    className="hidden h-8 w-auto object-contain dark:block"
                  />
                )}
              </>
            ) : orgLogo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- external URL from workspace */}
                <img
                  src={orgLogo}
                  alt={orgName}
                  className="size-8 rounded-lg object-cover"
                />
                <span className="hidden text-sm font-semibold text-foreground sm:block">
                  {orgName}
                </span>
              </>
            ) : (
              <>
                <span
                  className="flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  {orgName.charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-sm font-semibold text-foreground sm:block">
                  {orgName}
                </span>
              </>
            )}
          </Link>

          {/* Center: Tab navigation (desktop) */}
          <nav className="hidden items-center gap-0.5 sm:flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.match || pathname.startsWith(item.match + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                  {active && (
                    <span className="absolute -bottom-[9px] left-3 right-3 h-0.5 rounded-full bg-foreground" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right: User menu */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted">
                {candidateAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external URL
                  <img
                    src={candidateAvatarUrl}
                    alt={candidateName}
                    className="size-7 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    {candidateInitials}
                  </div>
                )}
                <CaretDownIcon className="hidden size-3.5 text-muted-foreground sm:block" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{candidateName}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={"/portal/profile" as Route}>
                    <UserCircleIcon className="mr-2 size-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="p-0">
                  {signOutForm}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted sm:hidden"
            >
              {mobileOpen ? <XIcon className="size-5" /> : <HamburgerIcon className="size-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        <div className={cn(
          "border-t border-border bg-background overflow-hidden transition-all duration-200 ease-in-out sm:hidden",
          mobileOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0 border-t-0",
        )}>
          <nav className="px-4 pb-3 pt-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.match || pathname.startsWith(item.match + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {children}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-background/60 py-4 text-center">
        <p className="text-xs text-muted-foreground">
          Powered by{" "}
          <span className="font-medium text-foreground">Harly</span>
        </p>
      </footer>
    </div>
  );
}
