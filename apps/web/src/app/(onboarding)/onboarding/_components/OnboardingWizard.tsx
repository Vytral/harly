"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Check,
  Loader2,
  Mail,
  Plug,
  Share2,
  X,
  type LucideIcon,
} from "lucide-react";

import { authClient } from "@openhire/auth/client";
import { BoardPreview } from "@/features/workspaces/BoardPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn, slugify } from "@/lib/utils";

// ─── Types & constants ────────────────────────────────────────────────────────

type Invite = { email: string; role: string };

const STEPS = ["Workspace", "Your role", "Extensions", "Invite team"] as const;

const PINE = "#1f6f53";

const ROLES = [
  { value: "founder", label: "Founder / CEO", hint: "Building the hiring process from scratch" },
  { value: "recruiter", label: "Recruiter", hint: "Sourcing and managing candidates" },
  { value: "hr_manager", label: "HR Manager", hint: "Overseeing the full people process" },
  { value: "hiring_manager", label: "Hiring Manager", hint: "Filling open roles on my team" },
  { value: "other", label: "Other", hint: "" },
] as const;

type Extension = {
  name: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
};

const EXTENSIONS: Extension[] = [
  {
    name: "Cal.com",
    description: "Let candidates self-schedule interviews — bookings sync back automatically.",
    icon: CalendarClock,
    available: true,
  },
  {
    name: "Google Calendar",
    description: "Two-way sync interviews with your team's calendars.",
    icon: CalendarPlus,
    available: false,
  },
  {
    name: "Gmail",
    description: "Send and log candidate emails from your own inbox.",
    icon: Mail,
    available: false,
  },
  {
    name: "Greenhouse",
    description: "Import jobs and candidates from an existing ATS.",
    icon: Plug,
    available: false,
  },
  {
    name: "LinkedIn",
    description: "Publish roles and receive applications from LinkedIn.",
    icon: Share2,
    available: false,
  },
];

const INVITE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "recruiter", label: "Recruiter" },
  { value: "hiring_manager", label: "Hiring Manager" },
] as const;

// ─── Main component ───────────────────────────────────────────────────────────

export function OnboardingWizard({ userName }: { userName: string }) {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [editingSlug, setEditingSlug] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [openIntegrations, setOpenIntegrations] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("recruiter");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const generatedSlug = useMemo(() => slugify(name), [name]);
  const resolvedSlug = customSlug || generatedSlug;
  const isLast = step === STEPS.length - 1;

  async function goNext() {
    setError(null);

    if (step === 0) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        setError("Workspace name is required.");
        return;
      }
      if (!resolvedSlug) {
        setError("Slug cannot be empty.");
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/workspaces/check-slug?slug=${encodeURIComponent(resolvedSlug)}`,
        );
        const data = (await res.json()) as { available: boolean };
        if (!data.available) {
          setError("This slug is already taken. Try a different name.");
          return;
        }
      } catch {
        setError("Could not validate. Please try again.");
        return;
      } finally {
        setIsLoading(false);
      }
    }

    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }

    await finish(invites);
  }

  async function finish(pendingInvites: Invite[]) {
    setIsLoading(true);
    try {
      const createResult = await authClient.organization.create({
        name: name.trim(),
        slug: slugify(resolvedSlug),
      });

      if (createResult.error) {
        setError(createResult.error.message ?? "Failed to create workspace.");
        return;
      }

      const orgId = createResult.data?.id;
      if (!orgId) {
        setError("Workspace created but ID was missing.");
        return;
      }

      await authClient.organization.setActive({ organizationId: orgId });

      await Promise.allSettled(
        pendingInvites.map((inv) =>
          authClient.organization.inviteMember({
            email: inv.email,
            role: inv.role as "admin" | "owner" | "member",
            organizationId: orgId,
          }),
        ),
      );

      router.replace(openIntegrations ? "/settings/integrations" : "/dashboard");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  function addInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes("@")) return;
    if (invites.some((i) => i.email === email)) return;
    setInvites((prev) => [...prev, { email, role: inviteRole }]);
    setInviteEmail("");
  }

  function removeInvite(index: number) {
    setInvites((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(31,41,38,0.04),0_12px_32px_-12px_rgba(31,41,38,0.12)]">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* ── Left: form ── */}
        <div className="flex min-h-[34rem] flex-col p-8 lg:p-10">
          <StepBar steps={STEPS} current={step} />

          <div className="mt-8 flex-1">
            {step === 0 && (
              <StepWorkspace
                userName={userName}
                name={name}
                onNameChange={(v) => {
                  setName(v);
                  setCustomSlug("");
                  setEditingSlug(false);
                  setError(null);
                }}
                customSlug={customSlug}
                generatedSlug={generatedSlug}
                resolvedSlug={resolvedSlug}
                editingSlug={editingSlug}
                onEditSlug={() => setEditingSlug(true)}
                onSlugChange={(v) => {
                  setCustomSlug(slugify(v));
                  setError(null);
                }}
              />
            )}

            {step === 1 && <StepRole selected={role} onSelect={setRole} />}

            {step === 2 && (
              <StepExtensions
                openIntegrations={openIntegrations}
                onToggle={setOpenIntegrations}
              />
            )}

            {step === 3 && (
              <StepInvite
                invites={invites}
                email={inviteEmail}
                role={inviteRole}
                onEmailChange={setInviteEmail}
                onRoleChange={setInviteRole}
                onAdd={addInvite}
                onRemove={removeInvite}
              />
            )}

            {error ? (
              <p className="mt-4 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          {/* Footer */}
          <div className="mt-8 flex items-center justify-between">
            <ProgressDots total={STEPS.length} current={step} />
            <div className="flex items-center gap-1.5">
              {step > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isLoading}
                  onClick={() => {
                    setStep((s) => s - 1);
                    setError(null);
                  }}
                >
                  Back
                </Button>
              )}
              {isLast && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={isLoading}
                  onClick={() => finish([])}
                >
                  Skip
                </Button>
              )}
              <Button size="sm" onClick={goNext} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : isLast ? (
                  "Finish"
                ) : (
                  <>
                    Continue
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Right: live preview ── */}
        <div className="relative hidden border-l border-border/70 bg-gradient-to-br from-sage/50 via-kraft/40 to-card lg:block">
          <div className="flex h-full flex-col justify-center gap-4 p-10">
            {step === 2 ? (
              <ExtensionsPreview />
            ) : (
              <>
                <BoardPreview
                  name={name || "Your company"}
                  slug={resolvedSlug}
                  logoUrl={null}
                  tagline={role ? roleTagline(role) : "We're hiring"}
                  heroImageUrl={null}
                  primaryColor={PINE}
                  boardStyle="hero"
                  logoStyle="bordered"
                />
                <p className="px-1 text-center text-xs text-muted-foreground">
                  Live preview of your public careers page
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function roleTagline(role: string) {
  const found = ROLES.find((r) => r.value === role);
  return found ? `${found.label} · We're hiring` : "We're hiring";
}

// ─── Step bar ─────────────────────────────────────────────────────────────────

function StepBar({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <nav className="flex items-center gap-1.5">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                done && "bg-primary text-primary-foreground",
                active && "bg-primary text-primary-foreground ring-2 ring-sage ring-offset-1 ring-offset-card",
                !done && !active && "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
            </span>
            <span
              className={cn(
                "hidden text-xs font-medium sm:inline",
                done || active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {index < steps.length - 1 && (
              <span className="h-px w-4 bg-border" />
            )}
          </div>
        );
      })}
    </nav>
  );
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 rounded-full transition-all",
            i === current ? "w-4 bg-primary" : i < current ? "w-2 bg-primary/40" : "w-2 bg-muted",
          )}
        />
      ))}
    </div>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="font-display text-2xl tracking-tight text-foreground">
        {title}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  );
}

// ─── Step 1: Workspace ────────────────────────────────────────────────────────

function StepWorkspace({
  userName,
  name,
  onNameChange,
  customSlug,
  generatedSlug,
  resolvedSlug,
  editingSlug,
  onEditSlug,
  onSlugChange,
}: {
  userName: string;
  name: string;
  onNameChange: (v: string) => void;
  customSlug: string;
  generatedSlug: string;
  resolvedSlug: string;
  editingSlug: boolean;
  onEditSlug: () => void;
  onSlugChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-pine">Welcome, {userName}</p>
      <StepHeading
        title="Name your workspace"
        subtitle="This is the name candidates see on your public careers page."
      />

      <div className="mt-7 space-y-3">
        <Input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Acme Recruiting"
          className="h-11"
        />

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Careers page:</span>
          <span className="font-mono text-muted-foreground">openhire.app/board/</span>
          {editingSlug ? (
            <input
              autoFocus
              value={customSlug || generatedSlug}
              onChange={(e) => onSlugChange(e.target.value)}
              className="w-32 rounded-md border border-input bg-card px-1.5 py-0.5 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          ) : (
            <>
              <span className="font-mono font-medium text-foreground">
                {resolvedSlug || "your-workspace"}
              </span>
              {resolvedSlug && (
                <button
                  type="button"
                  onClick={onEditSlug}
                  className="text-pine underline-offset-2 transition hover:underline"
                >
                  edit
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Role ─────────────────────────────────────────────────────────────

function StepRole({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (v: string) => void;
}) {
  return (
    <div>
      <StepHeading
        title="What best describes you?"
        subtitle="We'll tailor your workspace to how you hire."
      />
      <ul className="mt-7 space-y-2.5">
        {ROLES.map((opt) => {
          const active = selected === opt.value;
          return (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => onSelect(opt.value)}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                  active
                    ? "border-pine/40 bg-sage"
                    : "border-border hover:border-border hover:bg-muted/60",
                )}
              >
                <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                {opt.hint && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{opt.hint}</p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Step 3: Extensions ───────────────────────────────────────────────────────

function StepExtensions({
  openIntegrations,
  onToggle,
}: {
  openIntegrations: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div>
      <StepHeading
        title="Connect your tools"
        subtitle="OpenHire plugs into the apps you already use. Connect them anytime from Settings → Integrations."
      />

      <ul className="mt-6 space-y-2.5">
        {EXTENSIONS.map((ext) => {
          const Icon = ext.icon;
          return (
            <li
              key={ext.name}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3.5 py-3",
                ext.available ? "border-pine/30 bg-sage/40" : "border-border opacity-80",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                  ext.available ? "bg-sage text-sage-ink" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{ext.name}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      ext.available
                        ? "bg-pine/10 text-pine"
                        : "border border-dashed border-border text-muted-foreground",
                    )}
                  >
                    {ext.available ? "Available" : "Soon"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {ext.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <label className="mt-5 flex items-center justify-between rounded-xl border border-border px-4 py-3">
        <span className="text-sm text-foreground">
          Open Integrations right after setup
        </span>
        <Switch checked={openIntegrations} onCheckedChange={onToggle} />
      </label>
    </div>
  );
}

// ─── Step 4: Invite ───────────────────────────────────────────────────────────

function StepInvite({
  invites,
  email,
  role,
  onEmailChange,
  onRoleChange,
  onAdd,
  onRemove,
}: {
  invites: Invite[];
  email: string;
  role: string;
  onEmailChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div>
      <StepHeading
        title="Invite your team"
        subtitle="Optional — you can always invite teammates later from Settings."
      />

      <div className="mt-7 flex gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="teammate@company.com"
          className="h-10 min-w-0 flex-1"
        />
        <Select value={role} onValueChange={onRoleChange}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INVITE_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="secondary"
          onClick={onAdd}
          disabled={!email.includes("@")}
        >
          Add
        </Button>
      </div>

      {invites.length > 0 && (
        <ul className="mt-4 space-y-2">
          {invites.map((inv, i) => (
            <li
              key={inv.email}
              className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{inv.email}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {inv.role.replace("_", " ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-muted-foreground transition hover:text-destructive"
                aria-label="Remove"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Right pane: extensions preview ───────────────────────────────────────────

function ExtensionsPreview() {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
          <span className="size-2 rounded-full bg-rust/50" />
          <span className="size-2 rounded-full bg-clay/50" />
          <span className="size-2 rounded-full bg-pine/40" />
          <span className="ml-2 truncate rounded bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            openhire.app/settings/integrations
          </span>
        </div>
        <div className="space-y-2 p-3">
          <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Integrations
          </p>
          {EXTENSIONS.slice(0, 4).map((ext) => {
            const Icon = ext.icon;
            return (
              <div
                key={ext.name}
                className="flex items-center gap-2.5 rounded-lg border px-3 py-2"
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md",
                    ext.available ? "bg-sage text-sage-ink" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <p className="flex-1 truncate text-xs font-medium">{ext.name}</p>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                    ext.available ? "bg-pine/10 text-pine" : "text-muted-foreground",
                  )}
                >
                  {ext.available ? "Connect" : "Soon"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="px-1 text-center text-xs text-muted-foreground">
        Connect tools from Settings after setup
      </p>
    </div>
  );
}
