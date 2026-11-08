"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { authClient } from "@harly/auth/client";
import {
  completeOnboardingAction,
  saveOnboardingAvatarAction,
  saveOnboardingBrandingAction,
  saveUserRoleAction,
} from "@/features/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { BuildingsIcon } from "@/components/ui/icons/settings";
import {
  CaretRightIcon,
  CheckIcon,
  DownloadDuotoneIcon,
  MagicWandDuotoneIcon,
  MegaphoneDuotoneIcon,
  PaletteDuotoneIcon,
  RobotDuotoneIcon,
  SealCheckDuotoneIcon,
  UserCircleIcon,
  UsersThreeDuotoneIcon,
} from "@/components/ui/icons/phosphor";
import { cn, slugify } from "@/lib/utils";
import {
  OnboardingShell,
  StepField,
  StepHeading,
  StepStagger,
  type OnboardingStepMeta,
} from "./OnboardingShell";

const PINE = "#3f6212";

const COMPANY_STEP: OnboardingStepMeta = {
  key: "workspace",
  label: "Company",
  desc: "Name your hiring workspace",
  icon: BuildingsIcon,
};
const BRANDING_STEP: OnboardingStepMeta = {
  key: "branding",
  label: "Branding",
  desc: "Logo, color & tagline",
  icon: MagicWandDuotoneIcon,
};
const PROFILE_STEP: OnboardingStepMeta = {
  key: "profile",
  label: "You",
  desc: "Photo & job title",
  icon: UserCircleIcon,
};

// Balanced accent palette with evergreen, cool, warm and neutral options.
const SWATCHES = [
  "#3f6212",
  "#0f766e",
  "#166534",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#be123c",
  "#c2410c",
  "#a16207",
  "#1f2937",
];

export function OwnerOnboarding({
  userName,
  initialOrg,
  initialAvatar,
  aiConfigured = false,
  suggestedCompanyName,
}: {
  userName: string;
  /** Set when the workspace already exists (created by setup or a resumed
   *  onboarding). Its name is never asked again. */
  initialOrg?: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
    tagline?: string | null;
    primaryColor?: string | null;
  };
  initialAvatar?: string | null;
  /** Hides the "Connect AI" suggestion when a provider already works. */
  aiConfigured?: boolean;
  /** Name the operator gave at install (HARLY_ORG_NAME). When set, the company
   *  step is skipped and the workspace is created with it. */
  suggestedCompanyName?: string | null;
}) {
  const router = useRouter();
  // The company step exists only when no workspace does yet. Every step after
  // it is optional, so nothing here can block reaching the app.
  const steps = useMemo(
    () => (initialOrg || suggestedCompanyName ? [BRANDING_STEP, PROFILE_STEP] : [COMPANY_STEP, BRANDING_STEP, PROFILE_STEP]),
    [initialOrg, suggestedCompanyName],
  );
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState({ branding: false, profile: false });

  const [name, setName] = useState(initialOrg?.name ?? suggestedCompanyName?.trim() ?? "");
  const [orgId, setOrgId] = useState<string | null>(initialOrg?.id ?? null);

  const [logoUrl, setLogoUrl] = useState(initialOrg?.logo ?? "");
  const [tagline, setTagline] = useState(initialOrg?.tagline ?? "");
  const [color, setColor] = useState(initialOrg?.primaryColor ?? PINE);

  const [jobTitle, setJobTitle] = useState("");
  const [avatar, setAvatar] = useState(initialAvatar ?? "");

  const key = steps[step]?.key;
  const isLast = step === steps.length - 1;

  // Create the org as soon as the company step is confirmed (or skipped), so
  // later steps persist against it. The slug is derived silently from the name.
  // Harly is single-tenant: the careers board lives at the root.
  async function ensureWorkspace(): Promise<boolean> {
    if (orgId) return true;
    const trimmed = name.trim() || `${userName}'s workspace`;
    const slug = slugify(trimmed) || "workspace";
    const response = await fetch("/api/setup/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, slug }),
    });
    const created = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !created.id) {
      setError(created.error ?? "Couldn't create your workspace.");
      return false;
    }
    setOrgId(created.id);
    setName(trimmed);
    await authClient.organization.setActive({ organizationId: created.id });
    return true;
  }

  // Persist the current step. Untouched steps write nothing, so the wizard
  // never overwrites values the install or an earlier visit already set.
  async function persistCurrent(): Promise<boolean> {
    if (key === "workspace") return ensureWorkspace();
    if (key === "branding") {
      const touched =
        logoUrl !== (initialOrg?.logo ?? "") ||
        tagline !== (initialOrg?.tagline ?? "") ||
        color !== (initialOrg?.primaryColor ?? PINE);
      if (!touched) return true;
      const res = await saveOnboardingBrandingAction({ logoUrl, tagline, primaryColor: color });
      if (!res.ok) { setError(res.error ?? "Couldn't save branding."); return false; }
      setSaved((s) => ({ ...s, branding: true }));
    }
    if (key === "profile") {
      const title = jobTitle.trim();
      if (title) {
        const res = await saveUserRoleAction(title);
        if (!res.ok) { setError(res.error ?? "Couldn't save your job title."); return false; }
      }
      if (avatar && avatar !== (initialAvatar ?? "")) {
        const res = await saveOnboardingAvatarAction(avatar);
        if (!res.ok) { setError(res.error ?? "Couldn't save your photo."); return false; }
      }
      if (title || avatar !== (initialAvatar ?? "")) setSaved((s) => ({ ...s, profile: true }));
    }
    return true;
  }

  async function finish() {
    const res = await completeOnboardingAction();
    if (!res.ok) { setError(res.error ?? "Couldn't finish setup."); return; }
    setDone(true);
  }

  function advance(save: boolean) {
    setError(null);
    startTransition(async () => {
      if (key === "workspace") {
        // The workspace itself is the one thing a later step needs.
        if (!(await ensureWorkspace())) return;
        setStep((s) => s + 1);
        return;
      }
      // Name already known (install or env): create the workspace silently.
      if (!(await ensureWorkspace())) return;
      if (save && !(await persistCurrent())) return;
      if (isLast) return finish();
      setStep((s) => s + 1);
    });
  }

  if (done) {
    return (
      <Launchpad
        workspaceName={name}
        brandingSaved={saved.branding}
        profileSaved={saved.profile}
        aiConfigured={aiConfigured}
        onEnter={() => { router.replace("/dashboard"); router.refresh(); }}
      />
    );
  }

  return (
    <OnboardingShell
      railTitle="Get set up"
      railFootnote="Every step is optional and takes seconds. You can change everything later in Settings."
      steps={steps}
      current={step}
      onJump={(i) => { if (i < step) { setStep(i); setError(null); } }}
      error={error}
      pending={pending}
      isLast={isLast}
      onBack={() => { setStep((s) => s - 1); setError(null); }}
      onNext={() => advance(true)}
      onSkip={() => advance(false)}
      nextLabel={isLast ? "Finish setup" : "Continue"}
      minHeight="min-h-[28rem]"
    >
      {key === "workspace" && (
        <StepCompany userName={userName} name={name} onName={setName} locked={Boolean(orgId)} />
      )}
      {key === "branding" && (
        <StepBranding
          logoUrl={logoUrl}
          onLogo={setLogoUrl}
          tagline={tagline}
          onTagline={setTagline}
          color={color}
          onColor={setColor}
        />
      )}
      {key === "profile" && (
        <StepProfile
          jobTitle={jobTitle}
          onJobTitle={setJobTitle}
          avatar={avatar}
          onAvatar={setAvatar}
        />
      )}
    </OnboardingShell>
  );
}

function StepCompany({ userName, name, onName, locked }: { userName: string; name: string; onName: (v: string) => void; locked: boolean }) {
  return (
    <StepStagger>
      <StepField>
        <StepHeading
          eyebrow={`Welcome, ${userName}`}
          title="What's your company called?"
          subtitle="Candidates see this on your careers page and in emails. Skip it and we'll use a placeholder you can rename later."
        />
      </StepField>
      <StepField className="mt-7 space-y-3">
        <Input
          autoFocus
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Acme Recruiting"
          className="h-11"
          disabled={locked}
          aria-label="Company name"
        />
      </StepField>
    </StepStagger>
  );
}

function StepBranding({ logoUrl, onLogo, tagline, onTagline, color, onColor }: { logoUrl: string; onLogo: (v: string) => void; tagline: string; onTagline: (v: string) => void; color: string; onColor: (v: string) => void }) {
  const isCustomColor = !SWATCHES.some((swatch) => swatch.toLowerCase() === color.toLowerCase());

  return (
    <StepStagger>
      <StepField>
        <StepHeading
          title="Make it yours"
          subtitle="Add your logo, a tagline and an accent color. Everything is optional and editable later."
        />
      </StepField>
      <StepField className="mt-7 flex items-center gap-5">
        <FileDropzone
          value={logoUrl || null}
          onChange={(url) => onLogo(url ?? "")}
          variant="avatar"
          hint="Square logo · PNG, JPG, SVG or WEBP"
        />
        <div className="flex-1 space-y-1">
          <Label>Company logo</Label>
          <p className="text-xs text-muted-foreground">
            Shown as your app icon and on the careers page. Square works best.
          </p>
        </div>
      </StepField>
      <StepField className="mt-6 space-y-2">
        <Label htmlFor="ob-tagline">Careers page tagline</Label>
        <Input
          id="ob-tagline"
          value={tagline}
          onChange={(e) => onTagline(e.target.value)}
          placeholder="A short line about your company"
          maxLength={120}
        />
      </StepField>
      <StepField className="mt-6 space-y-2">
        <Label>Accent color</Label>
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onColor(s)}
              aria-label={`Use ${s}`}
              className={cn(
                "size-8 rounded-full ring-2 ring-offset-2 ring-offset-card transition active:scale-95 motion-reduce:active:scale-100",
                color.toLowerCase() === s.toLowerCase() ? "ring-pine" : "ring-transparent",
              )}
              style={{ backgroundColor: s }}
              aria-pressed={color.toLowerCase() === s.toLowerCase()}
            />
          ))}
          <label
            className={cn(
              "relative flex h-8 shrink-0 cursor-pointer items-center gap-2 overflow-hidden rounded-full border bg-card px-2.5 text-xs font-medium text-foreground transition hover:border-ring/40 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30",
              isCustomColor && "border-ring ring-2 ring-ring/20",
            )}
            aria-label="Custom color"
          >
            <input
              type="color"
              value={color}
              onChange={(e) => onColor(e.target.value)}
              className="absolute inset-0 z-10 cursor-pointer opacity-0"
            />
            <span
              className="pointer-events-none size-4 rounded-full border border-black/10"
              style={{ backgroundColor: color }}
            />
            <PaletteDuotoneIcon className="pointer-events-none size-3.5 text-muted-foreground" />
            <span className="pointer-events-none">Custom</span>
          </label>
        </div>
      </StepField>
    </StepStagger>
  );
}

function StepProfile({ jobTitle, onJobTitle, avatar, onAvatar }: { jobTitle: string; onJobTitle: (v: string) => void; avatar: string; onAvatar: (v: string) => void }) {
  return (
    <StepStagger>
      <StepField>
        <StepHeading
          title="Put a face to the name"
          subtitle="Your photo and title show next to your activity and to the hiring team. Optional."
        />
      </StepField>
      <StepField className="mt-7 flex items-center gap-5">
        <FileDropzone
          value={avatar || null}
          onChange={(url) => onAvatar(url ?? "")}
          variant="avatar"
          hint="Profile photo · PNG, JPG or WEBP"
        />
        <div className="flex-1 space-y-1">
          <Label>Profile photo</Label>
          <p className="text-xs text-muted-foreground">
            Shown on your profile and next to your activity.
          </p>
        </div>
      </StepField>
      <StepField className="mt-6 space-y-2">
        <Label htmlFor="ob-title">Your job title</Label>
        <Input
          id="ob-title"
          value={jobTitle}
          onChange={(e) => onJobTitle(e.target.value)}
          placeholder="Head of Talent"
          maxLength={80}
        />
      </StepField>
    </StepStagger>
  );
}

// ─── Launchpad (all set) ──────────────────────────────────────────────────────

function Launchpad({
  workspaceName,
  brandingSaved,
  profileSaved,
  aiConfigured,
  onEnter,
}: {
  workspaceName: string;
  brandingSaved: boolean;
  profileSaved: boolean;
  aiConfigured: boolean;
  onEnter: () => void;
}) {
  const reduceMotion = useReducedMotion();
  // The first hour starts with a job. AI is offered last, only when it is not
  // configured, and is plainly optional.
  const nextSteps = useMemo(() => {
    const list: { icon: typeof MegaphoneDuotoneIcon; label: string; hint: string; href: Route; primary: boolean }[] = [
      { icon: MegaphoneDuotoneIcon, label: "Create your first job", hint: "Describe the role, then publish it", href: "/dashboard/jobs/new" as Route, primary: true },
      { icon: UsersThreeDuotoneIcon, label: "Invite your team", hint: "Optional. Add teammates any time", href: "/settings/members" as Route, primary: false },
      { icon: DownloadDuotoneIcon, label: "Import candidates", hint: "From a CSV file", href: "/dashboard/candidates" as Route, primary: false },
    ];
    if (!aiConfigured) {
      list.push({ icon: RobotDuotoneIcon, label: "Connect AI (optional)", hint: "Bring your own provider to screen and draft", href: "/settings/ai" as Route, primary: false });
    }
    return list;
  }, [aiConfigured]);
  const doneItems = [
    "Workspace created",
    brandingSaved ? "Careers page branded" : null,
    profileSaved ? "Profile updated" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-border/70 bg-card p-6 text-center shadow-[0_12px_32px_-12px_rgba(31,41,38,0.12)] sm:p-8 lg:p-10">
      <motion.span
        initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 18 }}
        className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-sage text-pine ring-1 ring-pine/10"
      >
        <SealCheckDuotoneIcon className="size-8" />
      </motion.span>
      <h2 className="mt-5 font-display text-2xl tracking-tight text-foreground">
        {workspaceName || "Your workspace"} is ready
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        You can start hiring right away. Here is what is done and what is worth doing next.
      </p>

      <div className="mt-7 space-y-2 text-left">
        {doneItems.map((d) => (
          <div key={d} className="flex items-center gap-2.5 rounded-xl border border-pine/15 bg-sage/30 px-4 py-2.5">
            <CheckIcon className="size-4 text-pine" />
            <span className="text-sm font-medium text-foreground">{d}</span>
          </div>
        ))}
        {nextSteps.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href} className={cn("group flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors hover:border-pine/30 hover:bg-muted/40", s.primary ? "border-pine/30 bg-sage/40" : "bg-card")}>
              <Icon className={cn("size-5 shrink-0", s.primary ? "text-pine" : "text-muted-foreground")} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
              <CaretRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
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
