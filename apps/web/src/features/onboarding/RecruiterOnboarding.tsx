"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";

import { TwoFactorCard } from "@/features/security/TwoFactorCard";
import {
  completeRecruiterOnboardingAction,
  saveUserRoleAction,
} from "@/features/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SealCheckDuotoneIcon,
  ShieldCheckDuotoneIcon,
  UserPlusIcon,
} from "@/components/ui/icons/phosphor";
import {
  OnboardingShell,
  StepField,
  StepHeading,
  StepStagger,
  type OnboardingStepMeta,
} from "./OnboardingShell";

const STEPS: OnboardingStepMeta[] = [
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
      startTransition(async () => {
        const trimmed = jobTitle.trim();
        if (trimmed) {
          const res = await saveUserRoleAction(trimmed);
          if (!res.ok) return setError(res.error ?? "Couldn't save your role.");
        }
        setStep(1);
      });
      return;
    }
    finish();
  }

  // Completion enforces the workspace 2FA policy server-side, so a stale client
  // cannot bypass it. If 2FA is required and not yet enabled, the action errors.
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
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 18 }}
          className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-sage text-pine ring-1 ring-pine/10"
        >
          <SealCheckDuotoneIcon className="size-8" />
        </motion.span>
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

  const canSkipSecurity = isLast && !require2fa && !twoFactorEnabled;

  return (
    <OnboardingShell
      railTitle="Welcome"
      railFootnote="Less than a minute. You can update these in your account anytime."
      steps={STEPS}
      current={step}
      onJump={(i) => { if (i < step) { setStep(i); setError(null); } }}
      error={error}
      pending={pending}
      isLast={isLast}
      onBack={() => { setStep((s) => s - 1); setError(null); }}
      onNext={next}
      onSkip={canSkipSecurity ? finish : undefined}
      nextLabel={isLast ? "Enter workspace" : "Continue"}
      minHeight="min-h-[30rem]"
    >
      {step === 0 && (
        <StepStagger>
          <StepField>
            <StepHeading
              eyebrow={`Hi ${userName}`}
              title={`Welcome to ${workspaceName}`}
              subtitle="A couple of quick things and you're hiring. First, what should teammates know you as?"
            />
          </StepField>
          <StepField className="mt-7 max-w-md space-y-2">
            <Label htmlFor="rec-role">Your role</Label>
            <Input
              id="rec-role"
              autoFocus
              value={jobTitle}
              onChange={(e) => { setJobTitle(e.target.value); setError(null); }}
              placeholder="Technical Recruiter"
              maxLength={80}
              onKeyDown={(e) => { if (e.key === "Enter") next(); }}
            />
            <p className="text-xs text-muted-foreground">Shown on your profile and to the hiring team. Optional.</p>
          </StepField>
        </StepStagger>
      )}

      {step === 1 && (
        <StepStagger>
          <StepField>
            <StepHeading
              title="Secure your account"
              subtitle={
                require2fa
                  ? "This workspace requires two-factor authentication. Set it up to finish."
                  : "Add two-factor authentication for an extra layer of protection. Optional."
              }
            />
          </StepField>
          <StepField className="mt-6">
            {twoFactorEnabled ? (
              <div className="flex items-center gap-3 rounded-xl border border-pine/20 bg-sage/30 px-4 py-3.5">
                <ShieldCheckDuotoneIcon className="size-5 text-pine" />
                <p className="text-sm font-medium text-foreground">Two-factor authentication is active.</p>
              </div>
            ) : (
              <TwoFactorCard enabled={false} />
            )}
          </StepField>
        </StepStagger>
      )}
    </OnboardingShell>
  );
}
