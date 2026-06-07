"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { proxiedImageUrl } from "@/lib/image-proxy";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { WorkspaceOption } from "@/features/workspaces/data";
import { cn, slugify } from "@/lib/utils";

type WorkspaceSwitcherProps = {
  workspaces: WorkspaceOption[];
  active: { id: string; name: string; logoUrl: string | null };
};

/** Company logo, or its initial as a fallback mark. */
export function WorkspaceMark({
  name,
  logoUrl,
  className,
  priority,
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
  priority?: boolean;
}) {
  const proxiedLogoUrl = proxiedImageUrl(logoUrl);

  if (proxiedLogoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxiedLogoUrl}
        alt={name}
        className={cn(
          "aspect-square size-8 shrink-0 rounded-lg object-cover",
          className,
        )}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground",
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function WorkspaceSwitcher({
  workspaces,
  active,
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  function switchTo(organizationId: string) {
    if (organizationId === active.id) return;
    startTransition(async () => {
      const result = await authClient.organization.setActive({
        organizationId,
      });
      if (!result.error) {
        router.replace("/dashboard");
        router.refresh();
      }
    });
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <WorkspaceMark name={active.name} logoUrl={active.logoUrl} />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-display font-semibold">{active.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Workspace
                  </span>
                </div>
                {isPending ? (
                  <Loader2 className="ml-auto size-4 animate-spin" />
                ) : (
                  <ChevronsUpDown className="ml-auto size-4 opacity-60" />
                )}
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Workspaces
              </DropdownMenuLabel>
              {workspaces.map((workspace) => (
                <DropdownMenuItem
                  key={workspace.authOrganizationId}
                  onClick={() => switchTo(workspace.authOrganizationId)}
                  className="gap-2"
                >
                  <WorkspaceMark name={workspace.name} logoUrl={workspace.logoUrl} />
                  <span className="truncate">{workspace.name}</span>
                  <Check
                    className={cn(
                      "ml-auto size-4",
                      workspace.isActive ? "opacity-100" : "opacity-0",
                    )}
                  />
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
                className="gap-2 text-muted-foreground"
              >
                <span className="flex size-8 items-center justify-center rounded-lg border border-dashed">
                  <Plus className="size-4" />
                </span>
                Create organization
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Enter a name with at least 2 characters.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await authClient.organization.create({
        name: trimmed,
        slug: slugify(trimmed),
      });
      if (result.error || !result.data?.id) {
        setError(result.error?.message ?? "Could not create the organization.");
        return;
      }
      await authClient.organization.setActive({
        organizationId: result.data.id,
      });
      onOpenChange(false);
      setName("");
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            Spin up a separate workspace with its own jobs, candidates, and
            team. You can switch between them anytime.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="new-org-name">Organization name</Label>
          <Input
            id="new-org-name"
            value={name}
            autoFocus
            placeholder="Acme Inc."
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleCreate();
            }}
            disabled={isPending}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isPending}>
            {isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
