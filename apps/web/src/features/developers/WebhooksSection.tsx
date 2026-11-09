"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { dateFnsLocale } from "@/lib/date-fns-locale";

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
  { tone: "on" | "off" | "warn" | "neutral"; className?: string }
> = {
  active: { tone: "on" },
  paused: { tone: "off" },
  failing: {
    tone: "warn",
    className: "bg-danger-rust/10 text-danger-rust",
  },
  new: { tone: "neutral" },
};

const MAX_CHIPS = 4;

type Translator = ReturnType<typeof useTranslations>;

function when(iso: string, locale: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: dateFnsLocale(locale) });
}

function lastDeliveryText(last: DeliveryLike, t: Translator, locale: string): string {
  if (!last) return t("noDeliveriesYet");
  const at = when(last.deliveredAt ?? last.createdAt, locale);
  const status = last.responseStatus;
  if (last.status === "success") {
    return status ? t("lastDeliveredHttp", { at, status }) : t("lastDelivered", { at });
  }
  if (last.status === "pending" || last.status === "processing") return t("deliveryInProgress");
  return status ? t("lastAttemptFailedHttp", { at, status }) : t("lastAttemptFailed", { at });
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
  const t = useTranslations("features.developers.webhooksSection");
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
      if (!result.ok) toast.error(result.error ?? t("updateEndpointFailed"));
      else {
        toast.success(enabled ? t("endpointResumed") : t("endpointPaused"));
        router.refresh();
      }
    });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const result = await deleteWebhookAction(toDelete.id);
    if (!result.ok) {
      toast.error(result.error ?? t("deleteEndpointFailed"));
      throw new Error(result.error);
    }
    toast.success(t("endpointDeleted"));
    router.refresh();
  }

  async function confirmRotate() {
    if (!toRotate) return;
    const result = await rotateWebhookSecretAction(toRotate.id);
    if (!result.ok || !result.secret) {
      toast.error(result.error ?? t("rotateSecretFailed"));
      throw new Error(result.error);
    }
    setSecretDialog({ title: t("newSigningSecret"), secret: result.secret });
    router.refresh();
  }

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={WebhooksDuotoneIcon}
        title={t("webhooksTitle")}
        description={t("sectionDescription")}
        action={
          <>
            <Button variant="outline" onClick={() => setGuideOpen(true)}>
              <ShieldCheckDuotoneIcon className="size-4" /> {t("verifySignatures")}
            </Button>
            {canManage ? (
              <Button onClick={() => setFormFor("new")}>
                <PlusIcon className="size-4" /> {t("addEndpoint")}
              </Button>
            ) : null}
          </>
        }
      />

      <p className="-mt-1 text-[12.5px] text-soft-ink">
        {t("payloadReferenceQuestion")}{" "}
        <a
          href="/docs/api"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-near-ink underline-offset-2 hover:underline"
        >
          {t("openApiReference")} <ArrowUpRightIcon className="size-3" />
        </a>
      </p>

      {webhooks.length === 0 ? (
        <EmptyRow
          icon={WebhooksDuotoneIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            canManage ? (
              <Button onClick={() => setFormFor("new")}>
                <PlusIcon className="size-4" /> {t("addFirstEndpoint")}
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
        onCreated={(secret) => setSecretDialog({ title: t("endpointCreated"), secret })}
      />

      <SecretDialog value={secretDialog} onClose={() => setSecretDialog(null)} />

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{t("verifyDialogTitle")}</DialogTitle>
            <DialogDescription>{t("verifyDialogDescription")}</DialogDescription>
          </DialogHeader>
          <VerifyGuide />
        </DialogContent>
      </Dialog>

      <DeliveriesDialog hook={deliveriesFor} onClose={() => setDeliveriesFor(null)} />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        tone="destructive"
        title={t("deleteEndpointTitle")}
        description={t.rich("deleteEndpointDescription", {
          url: toDelete ? shortUrl(toDelete.url, 48) : "",
          code: (chunks) => <span className="font-mono text-near-ink">{chunks}</span>,
        })}
        confirmLabel={t("deleteEndpoint")}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={toRotate !== null}
        onOpenChange={(open) => !open && setToRotate(null)}
        tone="warning"
        title={t("rotateSecretTitle")}
        description={t("rotateSecretDescription")}
        confirmLabel={t("rotateSecret")}
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
  const t = useTranslations("features.developers.webhooksSection");
  const tUi = useTranslations("features.developers.developersUi");
  const locale = useLocale();
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
              {t(`health.${health}`)}
            </StatusPill>
            <span
              title={hook.url}
              className="min-w-0 max-w-full truncate font-mono text-[13px] font-medium text-near-ink"
            >
              {shortUrl(hook.url, 64)}
            </span>
            <button
              type="button"
              onClick={() => copy(hook.url, tUi)}
              aria-label={t("copyEndpointUrl")}
              className="grid size-6 shrink-0 place-items-center rounded-md text-soft-ink transition-colors hover:bg-row-wash hover:text-near-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/10"
            >
              <CopyIcon className="size-3.5" />
            </button>
          </div>
          {hook.description ? (
            <p className="text-[12.5px] text-soft-ink [overflow-wrap:anywhere]">{hook.description}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5" aria-label={t("subscribedEvents")}>
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
                    {t("moreEvents", { count: more })}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-soft-ink">
                    {t("allSubscribedEvents", { count: hook.events.length })}
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
            <span>{lastDeliveryText(hook.lastDelivery, t, locale)}</span>
            {hook.recent.total > 0 ? (
              <span>
                {t("recentSummary", { total: hook.recent.total, success: hook.recent.success })}
                {hook.recent.failed > 0 ? (
                  <span className="text-danger-rust"> · {t("recentFailed", { failed: hook.recent.failed })}</span>
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
              {t("sendTestEvent")}
            </Button>
            <Button size="sm" variant="outline" onClick={onDeliveries}>
              {t("deliveries")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground"
                  aria-label={t("actionsFor", { name: shortUrl(hook.url, 32) })}
                >
                  <DotsThreeVerticalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>{t("editEndpoint")}</DropdownMenuItem>
                <DropdownMenuItem onClick={onRotate}>{t("rotateSigningSecret")}</DropdownMenuItem>
                <DropdownMenuItem onClick={onToggle}>
                  {hook.enabled ? t("pauseDeliveries") : t("resumeDeliveries")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  {t("deleteEndpoint")}
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
  const t = useTranslations("features.developers.webhooksSection");
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
          {ok ? t("testDelivered") : result.error ? t("testNotSent") : t("testNotAccepted")}
        </p>
        <p className="tabular-nums text-soft-ink [overflow-wrap:anywhere]">
          {result.error
            ? result.error
            : [
                result.responseStatus ? t("httpStatus", { status: result.responseStatus }) : t("noResponse"),
                formatDuration(result.durationMs),
                result.detail,
              ]
                .filter((part) => part && part !== "-")
                .join(" · ")}
        </p>
        {!ok && !result.error ? (
          <p className="text-soft-ink">
            {t.rich("testRetryHint", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-soft-ink hover:text-near-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/10"
      >
        {t("dismiss")}
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
  const t = useTranslations("features.developers.webhooksSection");
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(editing?.url ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [selected, setSelected] = useState<string[]>(editing?.events ?? []);
  const [error, setError] = useState<string | null>(null);

  const tEvents = useTranslations("labels.developers.webhooks");
  const groups = groupWebhookEvents(events, tEvents);
  const allValues = events.map((e) => e.value);
  const allState = selectionState(selected, allValues);

  function submit() {
    setError(null);
    if (!/^https?:\/\/\S+$/i.test(url.trim())) {
      setError(t("enterValidUrl"));
      return;
    }
    if (selected.length === 0) {
      setError(t("pickOneEvent"));
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
          setError(result.error ?? t("updateEndpointFailed"));
          return;
        }
        toast.success(t("endpointUpdated"));
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
        setError(result.error ?? t("createEndpointFailed"));
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
        <DialogTitle>{editing ? t("editEndpoint") : t("addEndpoint")}</DialogTitle>
        <DialogDescription>{t("endpointFormDescription")}</DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="webhook-url">{t("endpointUrl")}</Label>
          <Input
            id="webhook-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("endpointUrlPlaceholder")}
            className="font-mono text-sm"
            aria-describedby="webhook-url-help"
          />
          <p id="webhook-url-help" className="text-[12px] text-soft-ink">
            {t("endpointUrlHelp")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="webhook-description">{t("descriptionOptional")}</Label>
          <Input
            id="webhook-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
          />
        </div>

        <fieldset className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-sm font-medium text-near-ink">
              {t("events")}{" "}
              <span className="font-normal tabular-nums text-soft-ink">
                {t("selectedCount", { selected: selected.length, total: allValues.length })}
              </span>
            </legend>
            <button
              type="button"
              onClick={() => setSelected(setAll(selected, allValues, allState !== "all"))}
              className="rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-near-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-near-ink/10"
            >
              {allState === "all" ? t("clearAll") : t("selectAll")}
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
                      aria-label={t("allGroupEvents", { group: group.label.toLowerCase() })}
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
          {t("cancel")}
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? <SpinnerIcon className="size-4 animate-spin" /> : null}
          {editing ? t("saveChanges") : t("createEndpoint")}
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
  const t = useTranslations("features.developers.webhooksSection");
  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      {value ? (
        <DialogContent size="lg" className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{value.title}</DialogTitle>
            <DialogDescription>
              {t.rich("signingSecretDescription", {
                code: (chunks) => <code className="font-mono">{chunks}</code>,
              })}
            </DialogDescription>
          </DialogHeader>
          <SecretField value={value.secret} label={t("signingSecret")} defaultRevealed />
          <VerifyGuide />
          <DialogFooter>
            <Button onClick={onClose}>{t("savedSecret")}</Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function VerifyGuide() {
  const t = useTranslations("features.developers.webhooksSection");
  const [lang, setLang] = useState<VerifyLanguage>("node");
  const code = (chunks: ReactNode) => <code className="font-mono">{chunks}</code>;
  return (
    <div className="min-w-0 space-y-4">
      <ol className="space-y-2 text-[13px] text-near-ink">
        <Step n={1}>{t.rich("step1", { code })}</Step>
        <Step n={2}>{t.rich("step2", { code, payload: "{t}.{raw body}" })}</Step>
        <Step n={3}>{t.rich("step3", { code })}</Step>
      </ol>

      <div className="inline-flex rounded-[var(--radius-btn)] bg-card-inset p-1" role="tablist" aria-label={t("languageLabel")}>
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

      <Callout tone="info" title={t("deliveryRules")}>
        {t.rich("deliveryRulesBody", { code })}
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
  const t = useTranslations("features.developers.webhooksSection");
  const [, startTransition] = useTransition();
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string | null } | { kind: "ready"; rows: DeliveryRow[] }
  >({ kind: "loading" });
  const [retrying, setRetrying] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listWebhookDeliveriesAction(hook.id).then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.deliveries) {
        setState({ kind: "error", message: result.error ?? null });
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
        toast.error(result.error ?? t("retryDeliveryFailed"));
        return;
      }
      toast.success(t("retryQueued"));
      router.refresh();
      window.setTimeout(load, 1200);
    });
  }

  const summary = state.kind === "ready" ? summarizeDeliveries(state.rows) : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("deliveryHistory")}</DialogTitle>
        <DialogDescription className="font-mono text-[12px] [overflow-wrap:anywhere]">
          {hook.url}
        </DialogDescription>
      </DialogHeader>

      {summary && summary.total > 0 ? (
        <p className="text-[12.5px] tabular-nums text-soft-ink">
          {t("latestSummary", { total: summary.total, success: summary.success })}
          {summary.failed > 0 ? (
            <span className="text-danger-rust"> · {t("recentFailed", { failed: summary.failed })}</span>
          ) : null}
        </p>
      ) : null}

      <div className="space-y-2">
        {state.kind === "loading" ? (
          <div className="space-y-2" aria-busy="true" aria-label={t("loadingDeliveries")}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[62px] w-full rounded-[var(--radius-inner)]" />
            ))}
          </div>
        ) : state.kind === "error" ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm font-medium text-near-ink">{t("couldNotLoadDeliveries")}</p>
            <p className="text-[12.5px] text-soft-ink">{state.message ?? t("loadDeliveriesFailed")}</p>
            <Button size="sm" variant="outline" onClick={load}>
              {t("tryAgain")}
            </Button>
          </div>
        ) : state.rows.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-near-ink">{t("noDeliveriesYet")}</p>
            <p className="mt-1 text-[12.5px] text-soft-ink">{t("deliveriesEmptyHint")}</p>
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
          {t("close")}
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
  const t = useTranslations("features.developers.webhooksSection");
  const locale = useLocale();
  const ok = row.status === "success";
  const inFlight = row.status === "pending" || row.status === "processing";
  const failed = !ok && !inFlight;
  const statusLabel = ok
    ? t("statusDelivered")
    : inFlight
      ? t("statusInProgress")
      : row.status === "dead_letter"
        ? t("statusGaveUp")
        : t("statusFailed");
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
            <span>{row.responseStatus ? t("httpStatus", { status: row.responseStatus }) : t("noResponse")}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDuration(row.durationMs)}</span>
            <span aria-hidden="true">·</span>
            <span>{when(row.deliveredAt ?? row.createdAt, locale)}</span>
            {row.attempts > 1 ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{t("attempts", { count: row.attempts })}</span>
              </>
            ) : null}
          </p>
          {failed && row.lastError ? (
            <p className="text-[12px] text-danger-rust [overflow-wrap:anywhere]">{row.lastError}</p>
          ) : null}
          {failed && row.nextRetryAt ? (
            <p className="text-[12px] text-soft-ink">{t("nextAutomaticRetry", { when: when(row.nextRetryAt, locale) })}</p>
          ) : null}
        </div>
        <Button size="sm" variant="outline" disabled={retrying || inFlight} onClick={onRetry}>
          {retrying ? (
            <SpinnerIcon className="size-3.5 animate-spin" />
          ) : (
            <ArrowsClockwiseIcon className="size-3.5" />
          )}
          {t("retry")}
        </Button>
      </div>
    </li>
  );
}
