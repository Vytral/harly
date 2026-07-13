"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { TwoFactorCard } from "@/features/security/TwoFactorCard";
import {
  completeRecruiterOnboardingAction,
  saveUserRoleAction,
} from "@/features/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CaretRightIcon,
  CheckIcon,
  SealCheckDuotoneIcon,
  ShieldCheckDuotoneIcon,
  SpinnerIcon,
  UserPlusIcon,
} from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";

type IconType = React.ComponentType<{ className?: string }>;

const STEPS: { key: string; label: string; desc: string; icon: IconType }[] = [
  { key: "profile", label: "Your profile", desc: "How teammates see you", icon: UserPlusIcon },
  { key: "security", label: "Security", desc: "Protect your account", icon: ShieldCheckDuotoneIcon },
];

export function RecruiterOnboarding({
  userName,
  workspaceName,
  require2fa,
  twoFactorEnabled,
}: {
  userName: string;
  workspaceName: string;
  require2fa: boolean;
  twoFactorEnabled: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [jobTitle, setJobTitle] = useState("");

  const isLast = step === STEPS.length - 1;

  function next() {
    setError(null);
    if (step === 0) {
      if (jobTitle.trim()) void saveUserRoleAction(jobTitle.trim());
      setStep(1);
      return;
    }
    finish();
  }

  // Completion enforces the workspace 2FA policy server-side, so a stale client
  // can't bypass it — if 2FA is required and not yet enabled, the action errors.
  function finish() {
    startTransition(async () => {
      const res = await completeRecruiterOnboardingAction();
      if (!res.ok) return setError(res.error ?? "Couldn't finish.");
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border/70 bg-card p-8 text-center shadow-[0_18px_44px_-16px_rgba(31,41,38,0.16)] lg:p-10">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-sage text-pine ring-1 ring-pine/10">
          <SealCheckDuotoneIcon className="size-8" />
        </span>
        <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-foreground">
          You&apos;re in
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Welcome to {workspaceName}. Your pipeline, candidates and tasks are ready.
        </p>
        <Button
          className="mt-7 w-full"
          size="lg"
          onClick={() => { router.replace("/dashboard"); router.refresh(); }}
        >
          Go to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(31,41,38,0.04),0_18px_44px_-16px_rgba(31,41,38,0.16)]">
      <div className="grid lg:grid-cols-[256px_minmax(0,1fr)]">
        {/* Left rail */}
        <aside className="hidden flex-col border-r border-border/70 bg-muted/30 p-7 lg:flex">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Welcome
          </p>
          <nav className="mt-6 space-y-1">
            {STEPS.map((s, i) => {
              const doneStep = i < step;
              const active = i === step;
              const Icon = s.icon;
              return (
                <div
                  key={s.key}
                  className={cn(
                    "relative flex items-start gap-3 rounded-xl px-2.5 py-2.5",
                    active && "bg-card shadow-sm ring-1 ring-border",
                  )}
                >
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
                      "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg",
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
                </div>
              );
            })}
          </nav>
          <p className="mt-auto pt-8 text-xs leading-relaxed text-muted-foreground">
            Less than a minute. You can update these in your account anytime.
          </p>
        </aside>

        {/* Right content */}
        <div className="flex min-h-[30rem] flex-col p-8 lg:p-12">
          <div className="mb-7 flex items-center gap-1.5 lg:hidden">
            {STEPS.map((s, i) => (
              <span key={s.key} className={cn("h-1.5 flex-1 rounded-full transition-all", i === step ? "bg-pine" : i < step ? "bg-pine/40" : "bg-muted")} />
            ))}
          </div>

          <div className="flex-1">
            {step === 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-pine">Hi {userName}</p>
                <div className="space-y-2">
                  <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground text-balance">
                    Welcome to {workspaceName}
                  </h2>
                  <p className="max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
                    A couple of quick things and you&apos;re hiring. First — what should teammates know you as?
                  </p>
                </div>
                <div className="mt-7 max-w-md space-y-2">
                  <Label htmlFor="rec-role">Your role</Label>
                  <Input id="rec-role" autoFocus value={jobTitle} onChange={(e) => { setJobTitle(e.target.value); setError(null); }} placeholder="Technical Recruiter" maxLength={80} onKeyDown={(e) => { if (e.key === "Enter") next(); }} />
                  <p className="text-xs text-muted-foreground">Shown on your profile and to the hiring team. Optional.</p>
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <div className="space-y-2">
                  <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground text-balance">
                    Secure your account
                  </h2>
                  <p className="max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
                    {require2fa
                      ? "This workspace requires two-factor authentication. Set it up to finish."
                      : "Add two-factor authentication for an extra layer of protection. Optional."}
                  </p>
                </div>
                <div className="mt-6">
                  {twoFactorEnabled ? (
                    <div className="flex items-center gap-3 rounded-xl border border-pine/20 bg-sage/30 px-4 py-3.5">
                      <ShieldCheckDuotoneIcon className="size-5 text-pine" />
                      <p className="text-sm font-medium text-foreground">Two-factor authentication is active.</p>
                    </div>
                  ) : (
                    <TwoFactorCard enabled={false} />
                  )}
                </div>
              </div>
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
            {isLast && !require2fa && !twoFactorEnabled && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={pending} onClick={finish}>
                Skip for now
              </Button>
            )}
            <Button size="sm" onClick={next} disabled={pending}>
              {pending ? (
                <SpinnerIcon className="size-4" />
              ) : isLast ? (
                "Enter workspace"
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
