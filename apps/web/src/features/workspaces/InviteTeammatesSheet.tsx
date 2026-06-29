"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import {
  cancelWorkspaceInvitationAction,
  inviteWorkspaceMembersAction,
  type BulkInviteResult,
} from "@/features/workspaces/actions";
import type { WorkspaceInvitationItem } from "@/features/workspaces/data";
import { parseCsv } from "@/lib/csv";
import {
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type AssignableRole = { key: string; name: string };

export type InviteLinkState = {
  token: string | null;
  role: string;
  enabled: boolean;
};

type InviteRow = { id: string; email: string; role: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const bulkInitial: BulkInviteResult = { success: false };

function newRow(role: string): InviteRow {
  return { id: crypto.randomUUID(), email: "", role };
}

/**
 * Shared invite drawer used by both the sidebar "Invite team" button and the
 * Members settings page. Multi-row (per-row role), paste-emails, CSV import,
 * and pending invitations. The shareable link lives separately in
 * {@link InviteLinkButton}.
 */
export function InviteTeammatesSheet({
  assignableRoles,
  pendingInvitations,
  open,
  onOpenChange,
  trigger,
}: {
  assignableRoles: AssignableRole[];
  pendingInvitations?: WorkspaceInvitationItem[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Custom trigger. Omit when driving the sheet via open/onOpenChange. */
  trigger?: ReactNode;
}) {
  const defaultRole = assignableRoles[0]?.key ?? "recruiter";
  const router = useRouter();

  const [rows, setRows] = useState<InviteRow[]>([newRow(defaultRole)]);
  const [pasteRole, setPasteRole] = useState(defaultRole);
  const [state, formAction, isPending] = useActionState(
    inviteWorkspaceMembersAction,
    bulkInitial,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const lastState = useRef(state);

  // Surface the bulk result, then reset the form on success.
  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state.success) {
      const parts: string[] = [];
      if (state.sent) parts.push(`${state.sent} invited`);
      if (state.added) parts.push(`${state.added} added`);
      const skipped = state.skipped?.length ?? 0;
      toast.success(
        parts.length ? parts.join(", ") : "Done",
        skipped
          ? { description: `${skipped} skipped (${state.skipped?.[0]?.reason ?? ""})` }
          : undefined,
      );
      setRows([newRow(defaultRole)]);
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, defaultRole, router]);

  function updateRow(id: string, patch: Partial<InviteRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, newRow(defaultRole)]);
  }

  function removeRow(id: string) {
    setRows((prev) =>
      prev.length === 1 ? [newRow(defaultRole)] : prev.filter((r) => r.id !== id),
    );
  }

  // Append emails parsed from a blob of pasted text (commas, spaces, newlines).
  function addEmails(emails: string[], role: string) {
    const existing = new Set(
      rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean),
    );
    const fresh: InviteRow[] = [];
    for (const raw of emails) {
      const email = raw.trim().toLowerCase();
      if (!email || existing.has(email)) continue;
      existing.add(email);
      fresh.push({ id: crypto.randomUUID(), email, role });
    }
    if (!fresh.length) return;
    setRows((prev) => {
      // Drop a single leading empty row so paste feels clean.
      const base = prev.length === 1 && !prev[0].email.trim() ? [] : prev;
      return [...base, ...fresh];
    });
  }

  function handlePaste(text: string) {
    const emails = text.split(/[\s,;]+/).filter((t) => EMAIL_RE.test(t));
    if (!emails.length) {
      toast.error("No valid emails found in pasted text.");
      return;
    }
    addEmails(emails, pasteRole);
    toast.success(`Added ${emails.length} email${emails.length === 1 ? "" : "s"}`);
  }

  async function handleCsv(file: File) {
    const text = await file.text();
    const grid = parseCsv(text);
    if (!grid.length) {
      toast.error("CSV is empty.");
      return;
    }
    // Detect header: find email + optional role columns.
    const header = grid[0].map((h) => h.trim().toLowerCase());
    const emailCol = header.findIndex((h) => h.includes("email") || h.includes("mail"));
    const roleCol = header.findIndex((h) => h === "role");
    const hasHeader = emailCol !== -1;
    const start = hasHeader ? 1 : 0;
    const ecol = hasHeader ? emailCol : 0;

    const roleKeys = new Set(assignableRoles.map((r) => r.key));
    const fresh: { email: string; role: string }[] = [];
    for (let i = start; i < grid.length; i++) {
      const cells = grid[i];
      const email = (cells[ecol] ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) continue;
      let role = pasteRole;
      if (roleCol !== -1) {
        const raw = (cells[roleCol] ?? "").trim().toLowerCase();
        if (roleKeys.has(raw)) role = raw;
      }
      fresh.push({ email, role });
    }
    if (!fresh.length) {
      toast.error("No valid emails found in CSV.");
      return;
    }
    const existing = new Set(
      rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean),
    );
    const toAdd = fresh.filter((f) => !existing.has(f.email));
    setRows((prev) => {
      const base = prev.length === 1 && !prev[0].email.trim() ? [] : prev;
      return [...base, ...toAdd.map((f) => ({ id: crypto.randomUUID(), ...f }))];
    });
    toast.success(`Imported ${toAdd.length} from CSV`);
  }

  // Only submit rows with a valid email.
  const validRows = rows.filter((r) => EMAIL_RE.test(r.email.trim()));
  const pending = pendingInvitations?.filter((i) => i.status === "pending") ?? [];

  function submit() {
    if (!validRows.length) {
      toast.error("Add at least one valid email.");
      return;
    }
    const fd = new FormData();
    fd.set(
      "invites",
      JSON.stringify(
        validRows.map((r) => ({ email: r.email.trim(), role: r.role })),
      ),
    );
    formAction(fd);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">
            Invite teammates
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Add people by email with a role each, or share a link.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Per-row email + role */}
          <div className="space-y-2">
            {rows.map((row) => {
              const invalid = row.email.trim() !== "" && !EMAIL_RE.test(row.email.trim());
              return (
                <div key={row.id} className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={row.email}
                    onChange={(e) => updateRow(row.id, { email: e.target.value })}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      if (/[\s,;]/.test(text.trim())) {
                        e.preventDefault();
                        handlePaste(text);
                      }
                    }}
                    placeholder="teammate@company.com"
                    aria-invalid={invalid}
                    className={cn("flex-1", invalid && "border-destructive")}
                    disabled={isPending}
                  />
                  <Select
                    value={row.role}
                    onValueChange={(v) => updateRow(row.id, { role: v })}
                  >
                    <SelectTrigger className="w-36 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map((r) => (
                        <SelectItem key={r.key} value={r.key}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(row.id)}
                    aria-label="Remove row"
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              );
            })}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addRow}
                className="text-muted-foreground"
              >
                <PlusIcon className="size-4" />
                Add another
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleCsv(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="text-muted-foreground"
              >
                <Upload className="size-4" />
                Import CSV
              </Button>
            </div>
          </div>

          {/* Paste a list */}
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Paste a list
              </Label>
              <Select value={pasteRole} onValueChange={setPasteRole}>
                <SelectTrigger className="h-8 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="ana@co.com, luis@co.com…"
              rows={2}
              className="resize-none bg-background text-sm"
              onChange={(e) => {
                const v = e.target.value;
                if (v.includes("\n")) {
                  handlePaste(v);
                  e.target.value = "";
                }
              }}
              onBlur={(e) => {
                if (e.target.value.trim()) {
                  handlePaste(e.target.value);
                  e.target.value = "";
                }
              }}
            />
            <p className="text-[11px] text-muted-foreground/70">
              Paste emails separated by commas, spaces, or new lines. They join
              with the role above (editable per row after).
            </p>
          </div>

          {/* Pending invitations */}
          {pending.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pending ({pending.length})
              </Label>
              <ul className="divide-y rounded-lg border">
                {pending.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{inv.email}</p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {inv.role.replace("_", " ")}
                      </p>
                    </div>
                    <CancelInvite invitationId={inv.id} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="border-t px-5 py-4">
          <Button
            type="button"
            onClick={submit}
            disabled={isPending || !validRows.length}
            className="w-full"
          >
            <UserPlusIcon className="size-4" />
            {isPending
              ? "Sending…"
              : `Send ${validRows.length || ""} invite${validRows.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CancelInvite({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
      onClick={() => {
        startTransition(async () => {
          const result = await cancelWorkspaceInvitationAction(invitationId);
          if (result.success) {
            toast.success("Invitation canceled.");
            router.refresh();
          } else {
            toast.error(result.error ?? "Unable to cancel.");
          }
        });
      }}
    >
      {isPending ? "Canceling…" : "Cancel"}
    </Button>
  );
}
