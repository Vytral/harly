"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";

import { authClient } from "@harly/auth/client";
import { inviteWorkspaceMemberAction } from "@/features/workspaces/actions";
import {
  completeOnboardingAction,
  saveAcquisitionAction,
  saveOnboardingBrandingAction,
  saveUserRoleAction,
  setRequire2faAction,
} from "@/features/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BuildingsIcon } from "@/components/ui/icons/settings";
import {
  CaretRightIcon,
  CheckIcon,
  DownloadDuotoneIcon,
  MagicWandDuotoneIcon,
  MegaphoneDuotoneIcon,
  PlugsConnectedIcon,
  RobotDuotoneIcon,
  SealCheckDuotoneIcon,
  ShieldCheckDuotoneIcon,
  SpinnerIcon,
  UsersThreeDuotoneIcon,
  XIcon,
} from "@/components/ui/icons/phosphor";
import { cn, slugify } from "@/lib/utils";

const PINE = "#3f6212";

type IconType = React.ComponentType<{ className?: string }>;

const STEPS: { key: string; label: string; desc: string; icon: IconType }[] = [
  { key: "workspace", label: "Workspace", desc: "Name your hiring workspace", icon: BuildingsIcon },
  { key: "branding", label: "Branding", desc: "Logo, color & tagline", icon: MagicWandDuotoneIcon },
  { key: "about", label: "About you", desc: "Your role & how you found us", icon: MegaphoneDuotoneIcon },
  { key: "security", label: "Security", desc: "Protect your team's data", icon: ShieldCheckDuotoneIcon },
  { key: "team", label: "Invite team", desc: "Bring in teammates", icon: UsersThreeDuotoneIcon },
];

const ACQUISITION = [
  "Search engine",
  "Social media",
  "Friend or colleague",
  "GitHub / open source",
  "Blog or article",
  "Other",
] as const;

const INVITE_ROLES = [
  { value: "recruiter", label: "Recruiter" },
  { value: "hiring_manager", label: "Hiring Manager" },
  { value: "admin", label: "Admin" },
] as const;

type Invite = { email: string; role: string };

export function OwnerOnboarding({
  userName,
  initialOrg,
}: {
  userName: string;
  /** Set when resuming setup for an owner whose workspace already exists. */
  initialOrg?: { id: string; name: string; slug: string };
}) {
  const router = useRouter();
  // Resuming an existing workspace? Skip the create step.
  const [step, setStep] = useState(initialOrg ? 1 : 0);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Step 1 — workspace
  const [name, setName] = useState(initialOrg?.name ?? "");
  const [customSlug, setCustomSlug] = useState(initialOrg?.slug ?? "");
  const [orgId, setOrgId] = useState<string | null>(initialOrg?.id ?? null);

  // Step 2 — branding
  const [tagline, setTagline] = useState("");
  const [color, setColor] = useState(PINE);

  // Step 3 — about
  const [source, setSource] = useState<string>("");
  const [jobTitle, setJobTitle] = useState("");

  // Step 4 — security
  const [require2fa, setRequire2fa] = useState(false);

  // Step 5 — invites
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("recruiter");
  const [invites, setInvites] = useState<Invite[]>([]);

  const generatedSlug = slugify(name);
  const resolvedSlug = customSlug || generatedSlug;
  const isLast = step === STEPS.length - 1;

  function next() {
    setError(null);
    if (step === 0) return createWorkspace();
    if (isLast) return finish();
    persistCurrent();
    setStep((s) => s + 1);
  }

  // Create the org as soon as the name is set, so later steps persist against
  // it (and an abandoned setup is resumable — the owner already exists).
  function createWorkspace() {
    const trimmed = name.trim();
    if (!trimmed) return setError("Name your workspace.");
    if (!resolvedSlug) return setError("Slug can't be empty.");
    startTransition(async () => {
      if (!orgId) {
        const res = await fetch(
          `/api/workspaces/check-slug?slug=${encodeURIComponent(resolvedSlug)}`,
        );
        const data = (await res.json()) as { available: boolean };
        if (!data.available) return setError("That slug is taken — try another.");

        const created = await authClient.organization.create({
          name: trimmed,
          slug: slugify(resolvedSlug),
        });
        if (created.error || !created.data?.id) {
          return setError(created.error?.message ?? "Couldn't create workspace.");
        }
        setOrgId(created.data.id);
        await authClient.organization.setActive({
          organizationId: created.data.id,
        });
      }
      setStep(1);
    });
  }

  // Fire-and-persist the current step's data (best-effort; never blocks nav).
  function persistCurrent() {
    if (step === 1) void saveOnboardingBrandingAction({ tagline, primaryColor: color });
    if (step === 2) {
      if (source) void saveAcquisitionAction(source);
      if (jobTitle.trim()) void saveUserRoleAction(jobTitle.trim());
    }
    if (step === 3) void setRequire2faAction(require2fa);
  }

  function finish() {
    startTransition(async () => {
      // Persist the security step (last interactive one before invites already
      // persisted on nav) + send invites + mark complete. Each step is checked:
      // a failure stops the flow and surfaces the error instead of completing
      // onboarding with a half-sent invite batch.
      const sec = await setRequire2faAction(require2fa);
      if (!sec.ok) return setError(sec.error ?? "Couldn't save security settings.");

      for (const inv of invites) {
        const fd = new FormData();
        fd.set("email", inv.email);
        fd.set("role", inv.role);
        const r = await inviteWorkspaceMemberAction({ success: true }, fd);
        if (!r.success) return setError(r.error ?? `Couldn't invite ${inv.email}.`);
      }

      const res = await completeOnboardingAction();
      if (!res.ok) return setError(res.error ?? "Couldn't finish setup.");
      setDone(true);
    });
  }

  function addInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes("@") || invites.some((i) => i.email === email)) return;
    setInvites((p) => [...p, { email, role: inviteRole }]);
    setInviteEmail("");
  }

  if (done) {
    return <Launchpad workspaceName={name} require2fa={require2fa} onEnter={() => { router.replace("/dashboard"); router.refresh(); }} />;
  }

  return (
    <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(31,41,38,0.04),0_18px_44px_-16px_rgba(31,41,38,0.16)]">
      <div className="grid lg:grid-cols-[256px_minmax(0,1fr)]">
        {/* Left — vertical progress rail */}
        <aside className="hidden flex-col border-r border-border/70 bg-muted/30 p-7 lg:flex">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Get set up
          </p>
          <VerticalRail
            current={step}
            onJump={(i) => { if (i < step) { setStep(i); setError(null); } }}
          />
          <p className="mt-auto pt-8 text-xs leading-relaxed text-muted-foreground">
            Takes about 2 minutes. You can change everything later in Settings.
          </p>
        </aside>

        {/* Right — focused step */}
        <div className="flex min-h-[32rem] flex-col p-8 lg:p-12">
          {/* Mobile progress (rail hidden < lg) */}
          <div className="mb-7 flex items-center gap-1.5 lg:hidden">
            {STEPS.map((s, i) => (
              <span
                key={s.key}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-all",
                  i === step ? "bg-pine" : i < step ? "bg-pine/40" : "bg-muted",
                )}
              />
            ))}
          </div>

          <div className="flex-1">
            {step === 0 && (
              <StepWorkspace
                userName={userName}
                name={name}
                onName={(v) => { setName(v); setCustomSlug(""); setError(null); }}
                slug={resolvedSlug}
                onSlug={(v) => { setCustomSlug(slugify(v)); setError(null); }}
                locked={Boolean(orgId)}
              />
            )}
            {step === 1 && (
              <StepBranding tagline={tagline} onTagline={setTagline} color={color} onColor={setColor} />
            )}
            {step === 2 && (
              <StepAbout source={source} onSource={setSource} jobTitle={jobTitle} onJobTitle={setJobTitle} />
            )}
            {step === 3 && <StepSecurity require2fa={require2fa} onToggle={setRequire2fa} />}
            {step === 4 && (
              <StepInvite
                invites={invites}
                email={inviteEmail}
                role={inviteRole}
                onEmail={setInviteEmail}
                onRole={setInviteRole}
                onAdd={addInvite}
                onRemove={(i) => setInvites((p) => p.filter((_, idx) => idx !== i))}
              />
            )}

            {error && (
              <p className="mt-5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="mt-10 flex items-center justify-end gap-1.5 border-t border-border/60 pt-5">
            {step > 0 && (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => { setStep((s) => s - 1); setError(null); }}>
                Back
              </Button>
            )}
            {step >= 1 && step < STEPS.length - 1 && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={pending} onClick={() => { persistCurrent(); setStep((s) => s + 1); }}>
                Skip
              </Button>
            )}
            <Button size="sm" onClick={next} disabled={pending}>
              {pending ? (
                <SpinnerIcon className="size-4" />
              ) : isLast ? (
                "Finish setup"
              ) : (
                <>
                  Continue
                  <CaretRightIcon className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VerticalRail({ current, onJump }: { current: number; onJump: (i: number) => void }) {
  return (
    <nav className="mt-6 space-y-1">
      {STEPS.map((s, i) => {
        const doneStep = i < current;
        const active = i === current;
        const Icon = s.icon;
        const reachable = i < current;
        return (
          <button
            key={s.key}
            type="button"
            disabled={!reachable}
            onClick={() => onJump(i)}
            className={cn(
              "group relative flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors",
              active && "bg-card shadow-sm ring-1 ring-border",
              reachable && "cursor-pointer hover:bg-card/70",
              !active && !reachable && "cursor-default",
            )}
          >
            {/* Connector */}
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[26px] top-[42px] h-[calc(100%-26px)] w-px",
                  doneStep ? "bg-pine/30" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                doneStep && "bg-pine text-white",
                active && "bg-sage text-pine ring-1 ring-pine/15",
                !doneStep && !active && "bg-muted text-muted-foreground",
              )}
            >
              {doneStep ? <CheckIcon className="size-4" /> : <Icon className="size-4" />}
            </span>
            <span className="min-w-0 pt-0.5">
              <span className={cn("block text-sm font-medium", active || doneStep ? "text-foreground" : "text-muted-foreground")}>
                {s.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{s.desc}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-2">
      <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground text-balance">
        {title}
      </h2>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
        {subtitle}
      </p>
    </div>
  );
}

function StepWorkspace({ userName, name, onName, slug, onSlug, locked }: { userName: string; name: string; onName: (v: string) => void; slug: string; onSlug: (v: string) => void; locked: boolean }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-pine">Welcome, {userName}</p>
      <Heading title="Name your workspace" subtitle="This is what candidates see on your public careers page." />
      <div className="mt-7 space-y-3">
        <Input autoFocus value={name} onChange={(e) => onName(e.target.value)} placeholder="Acme Recruiting" className="h-11" disabled={locked} />
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Careers page:</span>
          <span className="font-mono text-muted-foreground">/board/</span>
          <input value={slug} onChange={(e) => onSlug(e.target.value)} disabled={locked} className="w-36 rounded-md border border-input bg-card px-1.5 py-0.5 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-60" />
        </div>
        {locked && <p className="text-xs text-muted-foreground">Workspace created — continue setting it up below.</p>}
      </div>
    </div>
  );
}

function StepBranding({ tagline, onTagline, color, onColor }: { tagline: string; onTagline: (v: string) => void; color: string; onColor: (v: string) => void }) {
  const swatches = ["#3f6212", "#0f766e", "#1d4ed8", "#7c3aed", "#be123c", "#b45309"];
  return (
    <div>
      <Heading title="Make it yours" subtitle="Set a tagline and accent color. Upload a logo anytime from Settings → Company." />
      <div className="mt-7 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="ob-tagline">Careers page tagline</Label>
          <Input id="ob-tagline" value={tagline} onChange={(e) => onTagline(e.target.value)} placeholder="Join us — we're building the future of hiring" maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label>Accent color</Label>
          <div className="flex items-center gap-2">
            {swatches.map((s) => (
              <button key={s} type="button" onClick={() => onColor(s)} aria-label={`Use ${s}`} className={cn("size-8 rounded-lg ring-2 ring-offset-2 ring-offset-card transition", color === s ? "ring-pine" : "ring-transparent")} style={{ backgroundColor: s }} />
            ))}
            <input type="color" value={color} onChange={(e) => onColor(e.target.value)} className="size-8 cursor-pointer rounded-lg border bg-card" aria-label="Custom color" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepAbout({ source, onSource, jobTitle, onJobTitle }: { source: string; onSource: (v: string) => void; jobTitle: string; onJobTitle: (v: string) => void }) {
  return (
    <div>
      <Heading title="Tell us about you" subtitle="Helps us tailor Harly. Optional — skip anything you'd rather not share." />
      <div className="mt-7 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="ob-role">Your role</Label>
          <Input id="ob-role" value={jobTitle} onChange={(e) => onJobTitle(e.target.value)} placeholder="Head of Talent" maxLength={80} />
        </div>
        <div className="space-y-2">
          <Label>How did you hear about us?</Label>
          <Select value={source} onValueChange={onSource}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Choose one" /></SelectTrigger>
            <SelectContent>
              {ACQUISITION.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function StepSecurity({ require2fa, onToggle }: { require2fa: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div>
      <Heading title="Secure your workspace" subtitle="Recommended for teams handling candidate data." />
      <label className="mt-7 flex items-start justify-between gap-4 rounded-xl border bg-card px-4 py-3.5">
        <span className="flex items-start gap-3">
          <ShieldCheckDuotoneIcon className="mt-0.5 size-5 text-pine" />
          <span>
            <span className="block text-sm font-medium text-foreground">Require 2FA for all members</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Everyone must set up two-factor auth before accessing the dashboard. You can enable your own 2FA from your account.</span>
          </span>
        </span>
        <Switch checked={require2fa} onCheckedChange={onToggle} aria-label="Require 2FA" />
      </label>
    </div>
  );
}

function StepInvite({ invites, email, role, onEmail, onRole, onAdd, onRemove }: { invites: Invite[]; email: string; role: string; onEmail: (v: string) => void; onRole: (v: string) => void; onAdd: () => void; onRemove: (i: number) => void }) {
  return (
    <div>
      <Heading title="Invite your team" subtitle="They'll get an email to join with the role you pick. Optional." />
      <div className="mt-7 flex gap-2">
        <Input type="email" value={email} onChange={(e) => onEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }} placeholder="teammate@company.com" className="h-10 min-w-0 flex-1" />
        <Select value={role} onValueChange={onRole}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {INVITE_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" variant="secondary" onClick={onAdd} disabled={!email.includes("@")}>Add</Button>
      </div>
      {invites.length > 0 && (
        <ul className="mt-4 space-y-2">
          {invites.map((inv, i) => (
            <li key={inv.email} className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">{inv.email}</p>
                <p className="text-xs capitalize text-muted-foreground">{inv.role.replace("_", " ")}</p>
              </div>
              <button type="button" onClick={() => onRemove(i)} className="text-muted-foreground transition hover:text-destructive" aria-label="Remove">
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Launchpad (all set) ──────────────────────────────────────────────────────

function Launchpad({ workspaceName, require2fa, onEnter }: { workspaceName: string; require2fa: boolean; onEnter: () => void }) {
  const nextSteps = useMemo(
    () => [
      { icon: RobotDuotoneIcon, label: "Connect an AI provider", hint: "Auto-screen & draft outreach", href: "/settings/ai" as Route },
      { icon: PlugsConnectedIcon, label: "Connect integrations", hint: "Cal.com, Slack, Discord", href: "/settings/integrations" as Route },
      { icon: DownloadDuotoneIcon, label: "Import candidates", hint: "From CSV or Greenhouse", href: "/dashboard/candidates" as Route },
    ],
    [],
  );
  const done = [
    "Workspace created",
    "Careers page branded",
    require2fa ? "2FA required for everyone" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-border/70 bg-card p-8 text-center shadow-[0_12px_32px_-12px_rgba(31,41,38,0.12)] lg:p-10">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-sage text-pine ring-1 ring-pine/10">
        <SealCheckDuotoneIcon className="size-8" />
      </span>
      <h2 className="mt-5 font-display text-2xl tracking-tight text-foreground">
        {workspaceName || "Your workspace"} is ready
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        You&apos;re all set to start hiring. Here&apos;s what you&apos;ve done — and a few things worth doing next.
      </p>

      <div className="mt-7 space-y-2 text-left">
        {done.map((d) => (
          <div key={d} className="flex items-center gap-2.5 rounded-xl border border-pine/15 bg-sage/30 px-4 py-2.5">
            <CheckIcon className="size-4 text-pine" />
            <span className="text-sm font-medium text-foreground">{d}</span>
          </div>
        ))}
        {nextSteps.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href} className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5 transition-colors hover:border-pine/30 hover:bg-muted/40">
              <Icon className="size-5 text-muted-foreground" />
              <span className="flex-1">
                <span className="block text-sm font-medium text-foreground">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
              <CaretRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>

      <Button className="mt-7 w-full" size="lg" onClick={onEnter}>
        Go to dashboard
      </Button>
    </div>
  );
}
