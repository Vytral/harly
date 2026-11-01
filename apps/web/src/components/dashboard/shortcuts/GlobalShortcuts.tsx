"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";

import type { Permission } from "@/features/workspaces/permissions";
import type { ShortcutId } from "./catalog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { openShortcutsHelp } from "./shortcut-ui-store";
import { useShortcut } from "./useShortcut";

const REVIEW_QUEUE_HREF = "/dashboard/candidates?queue=review";

/** Destination and the permission its nav entry requires (null = everyone). */
export const GO_TARGETS: Array<{
  id: ShortcutId;
  href: string;
  permission: Permission | null;
}> = [
  { id: "go.home", href: "/dashboard", permission: null },
  { id: "go.candidates", href: "/dashboard/candidates", permission: "candidates:view" },
  { id: "go.pipeline", href: "/dashboard/pipeline", permission: "candidates:view" },
  { id: "go.jobs", href: "/dashboard/jobs", permission: "jobs:view" },
  { id: "go.tasks", href: "/dashboard/tasks", permission: "tasks:read" },
  { id: "go.review", href: REVIEW_QUEUE_HREF, permission: "candidates:view" },
];

function GoShortcut({
  id,
  href,
  enabled,
}: {
  id: ShortcutId;
  href: string;
  enabled: boolean;
}) {
  const router = useRouter();
  useShortcut(id, () => router.push(href as Route), { enabled });
  return null;
}

/**
 * App-wide shortcuts, mounted once in the header: "?" help, "/" search, "c"
 * create and the "g x" go-to sequences. Each has a visible twin in the UI (the
 * header buttons, the nav pills, ⌘K), and is bound only when the viewer may use
 * that destination.
 */
export function GlobalShortcuts({
  userPermissions,
  canCreate,
  onOpenSearch,
  onOpenCreate,
}: {
  userPermissions: readonly Permission[];
  canCreate: boolean;
  onOpenSearch: () => void;
  onOpenCreate: () => void;
}) {
  useShortcut("help.open", openShortcutsHelp);
  useShortcut("search.open", onOpenSearch);
  useShortcut("create.open", onOpenCreate, { enabled: canCreate });

  return (
    <>
      {GO_TARGETS.map((target) => (
        <GoShortcut
          key={target.id}
          id={target.id}
          href={target.href}
          enabled={target.permission === null || userPermissions.includes(target.permission)}
        />
      ))}
      <ShortcutsDialog />
    </>
  );
}
