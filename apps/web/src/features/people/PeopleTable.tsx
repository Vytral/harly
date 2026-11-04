"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FILTER_ALL } from "@/components/ui/FilterPill";
import { StatusPill } from "@/components/ui/status-pill";
import {
  DirectoryCard,
  FilterBar,
  FilterChip,
  FilterCountButton,
  SearchPill,
  TotalLine,
  dirTable,
  dirTd,
  dirTh,
  dirTr,
} from "@/features/candidates/directory-chrome";
import { cn } from "@/lib/utils";
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

  const filtersActive = Boolean(query) || role !== FILTER_ALL || specialty !== FILTER_ALL;
  const activeCount = [role, specialty].filter((v) => v !== FILTER_ALL).length;
  const clear = () => {
    setQuery("");
    setRole(FILTER_ALL);
    setSpecialty(FILTER_ALL);
  };

  return (
    <DirectoryCard>
      <FilterBar>
        <SearchPill
          value={query}
          onChange={setQuery}
          placeholder="Search people"
          label="Search people by name, title, or username"
        />
        <FilterCountButton count={activeCount} onClear={clear} />
        {roleOptions.length > 1 && (
          <FilterChip label="Role" value={role} onChange={setRole} options={roleOptions} />
        )}
        {specialtyOptions.length > 0 && (
          <FilterChip
            label="Specialty"
            value={specialty}
            onChange={setSpecialty}
            options={specialtyOptions}
          />
        )}
      </FilterBar>

      <TotalLine total={filtered.length} noun="person" pluralNoun="people" />

      {filtered.length === 0 ? (
        <EmptyState
          variant="filtered"
          icon={Search}
          title="No teammates match your search"
          description="Try a different name, title, or username."
          action={
            filtersActive ? (
              <Button variant="outline" size="sm" onClick={clear}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="relative overflow-x-auto">
          <table className={dirTable}>
            <thead>
              <tr>
                <th scope="col" className={dirTh}>Person</th>
                <th scope="col" className={cn(dirTh, "hidden sm:table-cell")}>Role</th>
                <th scope="col" className={cn(dirTh, "hidden md:table-cell")}>Specialties</th>
                <th scope="col" className={cn(dirTh, "hidden sm:table-cell")}>Timezone</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((person) => (
                <PersonRow key={person.id} person={person} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DirectoryCard>
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
        <span
          className={cn(
            "block truncate text-[14.5px] font-medium text-near-ink",
            href && "group-hover/row:underline",
          )}
        >
          {person.name}
        </span>
        <span className="block truncate text-[13px] text-soft-ink">
          {person.jobTitle ?? "—"}
        </span>
      </span>
    </span>
  );

  return (
    <tr className={dirTr}>
      <td className={cn(dirTd, "py-2")}>
        {href ? (
          <Link
            href={href}
            className="block min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
          >
            {content}
          </Link>
        ) : (
          content
        )}
      </td>
      <td className={cn(dirTd, "hidden sm:table-cell")}>
        <StatusPill tone="neutral" dot={false} className="capitalize">
          {person.role}
        </StatusPill>
      </td>
      <td className={cn(dirTd, "hidden max-w-[260px] md:table-cell")}>
        {person.specialties.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {person.specialties.slice(0, 3).map((item) => (
              <span
                key={item}
                className="rounded-full bg-card-inset px-2 py-0.5 text-[12px] font-medium text-soft-ink"
              >
                {item}
              </span>
            ))}
            {person.specialties.length > 3 ? (
              <span className="text-[12px] text-soft-ink">+{person.specialties.length - 3}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-quiet-mist">None</span>
        )}
      </td>
      <td className={cn(dirTd, "hidden whitespace-nowrap text-[13px] text-soft-ink sm:table-cell")}>
        {person.timezone ?? <span className="text-quiet-mist">None</span>}
      </td>
    </tr>
  );
}
