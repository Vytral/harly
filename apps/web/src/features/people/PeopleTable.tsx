"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { FILTER_ALL, FilterPill } from "@/components/ui/FilterPill";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/UserAvatar";

export type PersonListRow = {
  id: string;
  name: string;
  image: string | null;
  jobTitle: string | null;
  username: string | null;
  timezone: string | null;
  specialties: string[];
  role: string;
};

export function PeopleTable({ rows }: { rows: PersonListRow[] }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState(FILTER_ALL);
  const [specialty, setSpecialty] = useState(FILTER_ALL);

  const roleOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.role))).sort(),
    [rows],
  );
  const specialtyOptions = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => r.specialties))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (role !== FILTER_ALL && row.role !== role) return false;
      if (specialty !== FILTER_ALL && !row.specialties.includes(specialty))
        return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        (row.jobTitle?.toLowerCase().includes(q) ?? false) ||
        (row.username?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, query, role, specialty]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, title, or username"
            className="pl-9"
            aria-label="Search people"
          />
        </div>
        {roleOptions.length > 1 && (
          <FilterPill
            label="Role"
            value={role}
            onChange={setRole}
            options={roleOptions}
          />
        )}
        {specialtyOptions.length > 0 && (
          <FilterPill
            label="Specialty"
            value={specialty}
            onChange={setSpecialty}
            options={specialtyOptions}
          />
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No teammates match your search.
        </p>
      ) : (
        <Card className="gap-0 divide-y divide-border/60 overflow-hidden py-0">
          {filtered.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </Card>
      )}
    </div>
  );
}

function PersonRow({ person }: { person: PersonListRow }) {
  const href = person.username
    ? (`/people/${person.username}` as Route)
    : undefined;
  const content = (
    <span className="flex min-w-0 items-center gap-3">
      <UserAvatar name={person.name} src={person.image} size="lg" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{person.name}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {person.jobTitle ?? "—"}
        </span>
      </span>
    </span>
  );

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
      {href ? (
        <Link
          href={href}
          className="min-w-0 rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {content}
        </Link>
      ) : (
        content
      )}
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
        {person.timezone ?? ""}
      </span>
    </div>
  );
}
