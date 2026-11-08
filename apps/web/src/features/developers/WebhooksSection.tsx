"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

import {
  createWebhookAction,
  deleteWebhookAction,
  listWebhookDeliveriesAction,
  replayWebhookDeliveryAction,
  rotateWebhookSecretAction,
  testWebhookAction,
  updateWebhookAction,
  type WebhookTestResult,
} from "@/features/developers/actions";
import { CodePanel, copy, EmptyRow } from "@/features/developers/developers-ui";
import {
  VERIFY_SNIPPETS,
  endpointHealth,
  formatDuration,
  groupWebhookEvents,
  selectionState,
  setAll,
  shortUrl,
  summarizeDeliveries,
  type DeliveryLike,
  type EndpointHealth,
  type EventOption,
  type VerifyLanguage,
} from "@/features/developers/webhook-ui";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import {
  ArrowsClockwiseIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  CopyIcon,
  DotsThreeVerticalIcon,
  PaperPlaneDuotoneIcon,
  PlusIcon,
  ShieldCheckDuotoneIcon,
  SpinnerIcon,
  WarningCircleIcon,
  WebhooksDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SecretField } from "@/components/ui/secret-field";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/notification-island/toast";
import { cn } from "@/lib/utils";

export type WebhookView = {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  createdAt: string;
  lastDelivery: DeliveryLike;
  /** Outcome of the latest deliveries (up to 20). */
  recent: { total: number; success: number; failed: number };
};

type DeliveryRow = {
  id: string;
  event: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  durationMs: number | null;
};

const HEALTH_PILL: Record<
  EndpointHealth,
  { label: string; tone: "on" | "off" | "warn" | "neutral"; className?: string }
> = {
  active: { label: "Active", tone: "on" },
  paused: { label: "Paused", tone: "off" },
  failing: {
    label: "Failing",
    tone: "warn",
    className: "bg-danger-rust/10 text-danger-rust",
  },
  new: { label: "Waiting for first event", tone: "neutral" },
};

const MAX_CHIPS = 4;

function when(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

function lastDeliveryText(last: DeliveryLike): string {
  if (!last) return "No deliveries yet";
  const at = when(last.deliveredAt ?? last.createdAt);
  const http = last.responseStatus ? ` · HTTP ${last.responseStatus}` : "";
  if (last.status === "success") return `Last delivered ${at}${http}`;
  if (last.status === "pending" || last.status === "processing") return "Delivery in progress";
  return `Last attempt failed ${at}${http}`;
}

export function WebhooksSection({
  canManage,
  webhooks,
  events,
}: {
  canManage: boolean;
  webhooks: WebhookView[];
  events: EventOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formFor, setFormFor] = useState<WebhookView | "new" | null>(null);
  const [secretDialog, setSecretDialog] = useState<{ title: string; secret: string } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [tests, setTests] = useState<Record<string, WebhookTestResult | "running">>({});
  const [deliveriesFor, setDeliveriesFor] = useState<WebhookView | null>(null);
  const [toDelete, setToDelete] = useState<WebhookView | null>(null);
  const [toRotate, setToRotate] = useState<WebhookView | null>(null);

  function sendTest(hook: WebhookView) {
    setTests((prev) => ({ ...prev, [hook.id]: "running" }));
    startTransition(async () => {
      const result = await testWebhookAction(hook.id);
      setTests((prev) => ({ ...prev, [hook.id]: result }));
      router.refresh();
    });
  }

  function setEnabled(hook: WebhookView, enabled: boolean) {
    startTransition(async () => {
      const result = await updateWebhookAction({ id: hook.id, enabled });
      if (!result.ok) toast.error(result.error ?? "Could not update endpoint.");
      else {
        toast.success(enabled ? "Endpoint resumed" : "Endpoint paused");
        router.refresh();
      }
    });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const result = await deleteWebhookAction(toDelete.id);
    if (!result.ok) {
      toast.error(result.error ?? "Could not delete endpoint.");
      throw new Error(result.error);
    }
    toast.success("Endpoint deleted");
    router.refresh();
  }

  async function confirmRotate() {
    if (!toRotate) return;
    const result = await rotateWebhookSecretAction(toRotate.id);
    if (!result.ok || !result.secret) {
      toast.error(result.error ?? "Could not rotate the secret.");
      throw new Error(result.error);
    }
    setSecretDialog({ title: "New signing secret", secret: result.secret });
    router.refresh();
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={WebhooksDuotoneIcon}
        title="Webhooks"
        description="Harly sends a signed HTTPS POST to your server whenever something changes, such as a new application, a hire or an interview. Use it to sync your HRIS, notify Slack or trigger your own automations."
        action={
          <>
            <Button variant="outline" onClick={() => setGuideOpen(true)}>
              <ShieldCheckDuotoneIcon className="size-4" /> Verify signatures
            </Button>
            {canManage ? (
              <Button onClick={() => setFormFor("new")}>
                <PlusIcon className="size-4" /> Add endpoint
              </Button>
            ) : null}
          </>
        }
      />

      <p className="-mt-1 text-[12.5px] text-soft-ink">
        Want the full payload reference?{" "}
        <a
          href="/docs/api"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-near-ink underline-offset-2 hover:underline"
        >
          Open the API reference <ArrowUpRightIcon className="size-3" />
        </a>
      </p>

      {webhooks.length === 0 ? (
        <EmptyRow
          icon={WebhooksDuotoneIcon}
          title="No endpoints yet"
          description="Add the URL of your server and pick the events you care about. We'll show a signing secret once so you can verify every request."
          action={
            canManage ? (
              <Button onClick={() => setFormFor("new")}>
                <PlusIcon className="size-4" /> Add your first endpoint
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {webhooks.map((hook) => (
            <EndpointRow
              key={hook.id}
              hook={hook}
              events={events}
              canManage={canManage}
              test={tests[hook.id]}
              busy={pending}
              onTest={() => sendTest(hook)}
              onDismissTest={() =>
                setTests((prev) => {
                  const next = { ...prev };
                  delete next[hook.id];
                  return next;
                })
              }
              onDeliveries={() => setDeliveriesFor(hook)}
              onEdit={() => setFormFor(hook)}
              onRotate={() => setToRotate(hook)}
              onToggle={() => setEnabled(hook, !hook.enabled)}
              onDelete={() => setToDelete(hook)}
            />
          ))}
        </ul>
      )}

      <EndpointFormDialog
        target={formFor}
        events={events}
        onClose={() => setFormFor(null)}
        onCreated={(secret) => setSecretDialog({ title: "Endpoint created", secret })}
      />

      <SecretDialog value={secretDialog} onClose={() => setSecretDialog(null)} />

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Verify webhook signatures</DialogTitle>
            <DialogDescription>
              Check every request came from Harly before you trust it.
            </DialogDescription>
          </DialogHeader>
          <VerifyGuide />
        </DialogContent>
      </Dialog>

      <DeliveriesDialog hook={deliveriesFor} onClose={() => setDeliveriesFor(null)} />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        tone="destructive"
        title="Delete this endpoint?"
        description={
          <>
            Harly stops sending events to{" "}
            <span className="font-mono text-near-ink">{toDelete ? shortUrl(toDelete.url, 48) : ""}</span>{" "}
            and its delivery history is removed. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete endpoint"
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={toRotate !== null}
        onOpenChange={(open) => !open && setToRotate(null)}
        tone="warning"
        title="Rotate the signing secret?"
        description="The old secret stops working immediately. Update your server with the new one right away, or it will reject Harly's requests."
        confirmLabel="Rotate secret"
        onConfirm={confirmRotate}
      />
    </Card>
  );
}

function EndpointRow({
  hook,
  events,
  canManage,
  test,
  busy,
  onTest,
  onDismissTest,
  onDeliveries,
  onEdit,
  onRotate,
  onToggle,
  onDelete,
}: {
  hook: WebhookView;
  events: EventOption[];
  canManage: boolean;
  test: WebhookTestResult | "running" | undefined;
  busy: boolean;
  onTest: () => void;
  onDismissTest: () => void;
  onDeliveries: () => void;
  onEdit: () => void;
  onRotate: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const health = endpointHealth(hook.enabled, hook.lastDelivery);
  const pill = HEALTH_PILL[health];
  const label = (value: string) => events.find((e) => e.value === value)?.label ?? value;
  const shown = hook.events.slice(0, MAX_CHIPS);
  const more = hook.events.length - shown.length;
  const running = test === "running";

  return (
    <li className="animate-in fade-in rounded-[var(--radius-inner)] bg-card-inset p-4 duration-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <StatusPill tone={pill.tone} className={pill.className}>
              {pill.label}
            </StatusPill>
            <span
              title={hook.url}
              className="min-w-0 max-w-full truncate font-mono text-[13px] font-medium text-near-ink"
            >
              {shortUrl(hook.url, 64)}
            </span>
            <button
              type="button"
              onClick={() => copy(hook.url)}
              aria-label="Copy endpoint URL"
              className="grid size-6 shrink-0 place-items-center rounded-md text-soft-ink transition-colors hover:bg-row-wash hover:text-near-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/10"
            >
              <CopyIcon className="size-3.5" />
            </button>
          </div>
          {hook.description ? (
            <p className="text-[12.5px] text-soft-ink [overflow-wrap:anywhere]">{hook.description}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5" aria-label="Subscribed events">
            {shown.map((event) => (
              <span
                key={event}
                title={event}
                className="rounded-full border border-hairline bg-pure-snow px-2 py-0.5 text-[11.5px] font-medium text-soft-ink"
              >
                {label(event)}
              </span>
            ))}
            {more > 0 ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full px-2 py-0.5 text-[11.5px] font-medium text-near-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/10"
                  >
                    +{more} more
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-soft-ink">
                    All subscribed events ({hook.events.length})
                  </p>
                  <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                    {hook.events.map((event) => (
                      <li key={event} className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span>{label(event)}</span>
                        <code className="font-mono text-[11px] text-soft-ink">{event}</code>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums text-soft-ink">
            <span>{lastDeliveryText(hook.lastDelivery)}</span>
            {hook.recent.total > 0 ? (
              <span>
                Last {hook.recent.total}: {hook.recent.success} delivered
                {hook.recent.failed > 0 ? (
                  <span className="text-danger-rust"> · {hook.recent.failed} failed</span>
                ) : null}
              </span>
            ) : null}
          </p>
        </div>

        {canManage ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={onTest} disabled={busy || running || !hook.enabled}>
              {running ? (
                <SpinnerIcon className="size-3.5 animate-spin" />
              ) : (
                <PaperPlaneDuotoneIcon className="size-3.5" />
              )}
              Send test event
            </Button>
            <Button size="sm" variant="outline" onClick={onDeliveries}>
              Deliveries
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground"
                  aria-label={`Actions for ${shortUrl(hook.url, 32)}`}
                >
                  <DotsThreeVerticalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>Edit endpoint</DropdownMenuItem>
                <DropdownMenuItem onClick={onRotate}>Rotate signing secret</DropdownMenuItem>
                <DropdownMenuItem onClick={onToggle}>
                  {hook.enabled ? "Pause deliveries" : "Resume deliveries"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  Delete endpoint
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      {test && test !== "running" ? <TestResult result={test} onDismiss={onDismissTest} /> : null}
    </li>
  );
}

function TestResult({ result, onDismiss }: { result: WebhookTestResult; onDismiss: () => void }) {
  const ok = result.ok;
  return (
    <div
      role="status"
      className={cn(
        "animate-in fade-in slide-in-from-top-1 mt-3 flex items-start gap-2.5 rounded-[var(--radius-btn)] border px-3 py-2.5 text-[12.5px] duration-200",
        ok
          ? "border-success-olive/25 bg-lime-wash text-near-ink"
          : "border-danger-rust/25 bg-danger-rust/10 text-near-ink",
      )}
    >
      {ok ? (
        <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-success-olive" />
      ) : (
        <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-danger-rust" />
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium">
          {ok ? "Test event delivered" : result.error ? "Test event not sent" : "Your server did not accept the test event"}
        </p>
        <p className="tabular-nums text-soft-ink [overflow-wrap:anywhere]">
          {result.error
            ? result.error
            : [
                result.responseStatus ? `HTTP ${result.responseStatus}` : "No response",
                formatDuration(result.durationMs),
                result.detail,
              ]
                .filter((part) => part && part !== "-")
                .join(" · ")}
        </p>
        {!ok && !result.error ? (
          <p className="text-soft-ink">
            Return a 2xx status within 10 seconds. The event is <code className="font-mono">webhook.test</code>.
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-soft-ink hover:text-near-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/10"
      >
        Dismiss
      </button>
    </div>
  );
}

/* ── Create / edit ───────────────────────────────────────────────────── */

function EndpointFormDialog({
  target,
  events,
  onClose,
  onCreated,
}: {
  target: WebhookView | "new" | null;
  events: EventOption[];
  onClose: () => void;
  onCreated: (secret: string) => void;
}) {
  const open = target !== null;
  const editing = target && target !== "new" ? target : null;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open ? (
        <DialogContent size="lg" className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <EndpointForm
            key={editing?.id ?? "new"}
            editing={editing}
            events={events}
            onClose={onClose}
            onCreated={onCreated}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function EndpointForm({
  editing,
  events,
  onClose,
  onCreated,
}: {
  editing: WebhookView | null;
  events: EventOption[];
  onClose: () => void;
  onCreated: (secret: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(editing?.url ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [selected, setSelected] = useState<string[]>(editing?.events ?? []);
  const [error, setError] = useState<string | null>(null);

  const groups = groupWebhookEvents(events);
  const allValues = events.map((e) => e.value);
  const allState = selectionState(selected, allValues);

  function submit() {
    setError(null);
    if (!/^https?:\/\/\S+$/i.test(url.trim())) {
      setError("Enter a full URL starting with https://");
      return;
    }
    if (selected.length === 0) {
      setError("Pick at least one event to subscribe to.");
      return;
    }
    startTransition(async () => {
      if (editing) {
        const result = await updateWebhookAction({
          id: editing.id,
          url: url.trim(),
          events: selected,
          description: description.trim() || null,
        });
        if (!result.ok) {
          setError(result.error ?? "Could not update endpoint.");
          return;
        }
        toast.success("Endpoint updated");
        onClose();
        router.refresh();
        return;
      }
      const result = await createWebhookAction({
        url: url.trim(),
        events: selected,
        description: description.trim() || undefined,
      });
      if (!result.ok || !result.secret) {
        setError(result.error ?? "Could not create endpoint.");
        return;
      }
      onClose();
      onCreated(result.secret);
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit endpoint" : "Add endpoint"}</DialogTitle>
        <DialogDescription>
          Harly will POST a JSON payload to this URL for each event you select.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="webhook-url">Endpoint URL</Label>
          <Input
            id="webhook-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/webhooks/harly"
            className="font-mono text-sm"
            aria-describedby="webhook-url-help"
          />
          <p id="webhook-url-help" className="text-[12px] text-soft-ink">
            Must be a public HTTPS address. Private and local addresses are blocked.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="webhook-description">Description (optional)</Label>
          <Input
            id="webhook-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Slack notifier"
          />
        </div>

        <fieldset className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-sm font-medium text-near-ink">
              Events{" "}
              <span className="font-normal tabular-nums text-soft-ink">
                ({selected.length} of {allValues.length})
              </span>
            </legend>
            <button
              type="button"
              onClick={() => setSelected(setAll(selected, allValues, allState !== "all"))}
              className="rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-near-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/10"
            >
              {allState === "all" ? "Clear all" : "Select all"}
            </button>
          </div>

          <div className="max-h-[40dvh] space-y-4 overflow-y-auto rounded-[var(--radius-inner)] border border-hairline p-3">
            {groups.map((group) => {
              const values = group.events.map((e) => e.value);
              const state = selectionState(selected, values);
              return (
                <div key={group.key} role="group" aria-label={group.label}>
                  <label className="flex cursor-pointer items-center gap-2.5 py-1">
                    <Checkbox
                      checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
                      onCheckedChange={() => setSelected(setAll(selected, values, state !== "all"))}
                      aria-label={`All ${group.label.toLowerCase()} events`}
                    />
                    <span className="text-[13px] font-semibold text-near-ink">{group.label}</span>
                    <span className="hidden truncate text-[12px] text-soft-ink sm:inline">
                      {group.description}
                    </span>
                  </label>
                  <ul className="mt-0.5 space-y-0.5 pl-6">
                    {group.events.map((event) => (
                      <li key={event.value}>
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-row-wash">
                          <Checkbox
                            className="mt-0.5"
                            checked={selected.includes(event.value)}
                            onCheckedChange={(on) =>
                              setSelected(setAll(selected, [event.value], on === true))
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-x-2">
                              <span className="text-[13px] font-medium text-near-ink">{event.label}</span>
                              <code className="font-mono text-[11px] text-soft-ink">{event.value}</code>
                            </span>
                            {event.description ? (
                              <span className="block text-[12px] text-soft-ink">{event.description}</span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="text-[12.5px] font-medium text-danger-rust">
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? <SpinnerIcon className="size-4 animate-spin" /> : null}
          {editing ? "Save changes" : "Create endpoint"}
        </Button>
      </DialogFooter>
    </>
  );
}

/* ── Signing secret + verification guide ─────────────────────────────── */

function SecretDialog({
  value,
  onClose,
}: {
  value: { title: string; secret: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      {value ? (
        <DialogContent size="lg" className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{value.title}</DialogTitle>
            <DialogDescription>
              Store this signing secret on your server, for example as{" "}
              <code className="font-mono">HARLY_WEBHOOK_SECRET</code>. It&apos;s shown only once.
            </DialogDescription>
          </DialogHeader>
          <SecretField value={value.secret} label="Signing secret" defaultRevealed />
          <VerifyGuide />
          <DialogFooter>
            <Button onClick={onClose}>I&apos;ve saved the secret</Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function VerifyGuide() {
  const [lang, setLang] = useState<VerifyLanguage>("node");
  return (
    <div className="min-w-0 space-y-4">
      <ol className="space-y-2 text-[13px] text-near-ink">
        <Step n={1}>
          Read the <code className="font-mono">X-Harly-Signature-256</code> header. It looks like{" "}
          <code className="font-mono">t=1735689600,v1=9f2c…</code>.
        </Step>
        <Step n={2}>
          Compute <code className="font-mono">HMAC-SHA256</code> with your signing secret over{" "}
          <code className="font-mono">{"{t}.{raw body}"}</code>, as hex. Use the raw body, not re-serialized JSON.
        </Step>
        <Step n={3}>
          Compare it with <code className="font-mono">v1</code> in constant time and reject timestamps older than 5 minutes.
        </Step>
      </ol>

      <div className="inline-flex rounded-[var(--radius-btn)] bg-card-inset p-1" role="tablist" aria-label="Language">
        {(["node", "python"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={lang === key}
            onClick={() => setLang(key)}
            className={cn(
              "rounded-[8px] px-3 py-1 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/10",
              lang === key ? "bg-pure-snow text-near-ink shadow-[var(--shadow-card)]" : "text-soft-ink hover:text-near-ink",
            )}
          >
            {key === "node" ? "Node.js" : "Python"}
          </button>
        ))}
      </div>
      <CodePanel code={VERIFY_SNIPPETS[lang]} language={lang === "node" ? "JavaScript" : "Python"} />

      <Callout tone="info" title="Delivery rules">
        Answer with any 2xx status within 10 seconds. Failed deliveries are retried with growing delays, from 1 minute up
        to 24 hours, then marked as failed. Other headers: <code className="font-mono">X-Harly-Event</code> and{" "}
        <code className="font-mono">X-Harly-Delivery</code> (use it to de-duplicate).
      </Callout>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-lime-wash text-[11px] font-semibold tabular-nums text-near-ink">
        {n}
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </li>
  );
}

/* ── Delivery history ────────────────────────────────────────────────── */

function DeliveriesDialog({ hook, onClose }: { hook: WebhookView | null; onClose: () => void }) {
  return (
    <Dialog open={hook !== null} onOpenChange={(open) => !open && onClose()}>
      {hook ? (
        <DialogContent size="lg" className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DeliveriesBody hook={hook} onClose={onClose} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function DeliveriesBody({ hook, onClose }: { hook: WebhookView; onClose: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; rows: DeliveryRow[] }
  >({ kind: "loading" });
  const [retrying, setRetrying] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listWebhookDeliveriesAction(hook.id).then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.deliveries) {
        setState({ kind: "error", message: result.error ?? "Could not load deliveries." });
      } else {
        setState({ kind: "ready", rows: result.deliveries });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hook.id, reloadKey]);

  function load() {
    setState({ kind: "loading" });
    setReloadKey((key) => key + 1);
  }

  function retry(deliveryId: string) {
    setRetrying(deliveryId);
    startTransition(async () => {
      const result = await replayWebhookDeliveryAction({ endpointId: hook.id, deliveryId });
      setRetrying(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not retry delivery.");
        return;
      }
      toast.success("Retry queued");
      router.refresh();
      window.setTimeout(load, 1200);
    });
  }

  const summary = state.kind === "ready" ? summarizeDeliveries(state.rows) : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delivery history</DialogTitle>
        <DialogDescription className="font-mono text-[12px] [overflow-wrap:anywhere]">
          {hook.url}
        </DialogDescription>
      </DialogHeader>

      {summary && summary.total > 0 ? (
        <p className="text-[12.5px] tabular-nums text-soft-ink">
          Latest {summary.total}: {summary.success} delivered
          {summary.failed > 0 ? <span className="text-danger-rust"> · {summary.failed} failed</span> : null}
        </p>
      ) : null}

      <div className="space-y-2">
        {state.kind === "loading" ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading deliveries">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[62px] w-full rounded-[var(--radius-inner)]" />
            ))}
          </div>
        ) : state.kind === "error" ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm font-medium text-near-ink">Couldn&apos;t load deliveries</p>
            <p className="text-[12.5px] text-soft-ink">{state.message}</p>
            <Button size="sm" variant="outline" onClick={load}>
              Try again
            </Button>
          </div>
        ) : state.rows.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-near-ink">No deliveries yet</p>
            <p className="mt-1 text-[12.5px] text-soft-ink">
              Send a test event, or wait for a subscribed event to happen.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {state.rows.map((row) => (
              <DeliveryItem key={row.id} row={row} retrying={retrying === row.id} onRetry={() => retry(row.id)} />
            ))}
          </ul>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

function DeliveryItem({
  row,
  retrying,
  onRetry,
}: {
  row: DeliveryRow;
  retrying: boolean;
  onRetry: () => void;
}) {
  const ok = row.status === "success";
  const inFlight = row.status === "pending" || row.status === "processing";
  const failed = !ok && !inFlight;
  const statusLabel = ok
    ? "Delivered"
    : inFlight
      ? "In progress"
      : row.status === "dead_letter"
        ? "Gave up"
        : "Failed";
  return (
    <li className="rounded-[var(--radius-inner)] bg-card-inset px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              tone={ok ? "on" : inFlight ? "neutral" : "warn"}
              className={failed ? "bg-danger-rust/10 text-danger-rust" : undefined}
            >
              {statusLabel}
            </StatusPill>
            <code className="truncate font-mono text-[12px] text-near-ink">{row.event}</code>
          </div>
          <p className="flex flex-wrap gap-x-2 text-[12px] tabular-nums text-soft-ink">
            <span>{row.responseStatus ? `HTTP ${row.responseStatus}` : "No response"}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDuration(row.durationMs)}</span>
            <span aria-hidden="true">·</span>
            <span>{when(row.deliveredAt ?? row.createdAt)}</span>
            {row.attempts > 1 ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{row.attempts} attempts</span>
              </>
            ) : null}
          </p>
          {failed && row.lastError ? (
            <p className="text-[12px] text-danger-rust [overflow-wrap:anywhere]">{row.lastError}</p>
          ) : null}
          {failed && row.nextRetryAt ? (
            <p className="text-[12px] text-soft-ink">Next automatic retry {when(row.nextRetryAt)}</p>
          ) : null}
        </div>
        <Button size="sm" variant="outline" disabled={retrying || inFlight} onClick={onRetry}>
          {retrying ? (
            <SpinnerIcon className="size-3.5 animate-spin" />
          ) : (
            <ArrowsClockwiseIcon className="size-3.5" />
          )}
          Retry
        </Button>
      </div>
    </li>
  );
}
