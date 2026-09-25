"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { toast } from "@/lib/notification-island/toast";
import { SectionHeader, StatusPill } from "@/features/workspaces/settings-ui";
import { SsoDuotoneIcon } from "@/components/ui/icons/phosphor";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { updateEnabledLoginMethodsAction } from "@/features/security/actions";
import {
  LOGIN_METHODS,
  type AvailableLoginMethods,
  type LoginMethod,
} from "@/features/auth/login-methods";

/** Human labels + helper text for each method row. */
const METHOD_META: Record<
  LoginMethod,
  { label: string; hint: string }
> = {
  password: { label: "Email & password", hint: "Standard email + password sign-in." },
  google: { label: "Google", hint: "OAuth via Google Workspace." },
  microsoft: { label: "Microsoft / Entra ID", hint: "OAuth via Microsoft accounts." },
  github: { label: "GitHub", hint: "OAuth via GitHub." },
  linkedin: { label: "LinkedIn", hint: "OAuth via LinkedIn." },
  sso: { label: "Enterprise SSO", hint: "SAML or OIDC single sign-on." },
  magic_link: { label: "Magic link", hint: "Passwordless email sign-in link." },
  passkey: { label: "Passkey", hint: "WebAuthn device / platform authenticator." },
};

/**
 * Map a configured-methods object onto the flat LoginMethod keys so we can tell,
 * per row, whether the method is actually usable on this deployment.
 */
function toConfiguredSet(configured: AvailableLoginMethods): Set<LoginMethod> {
  const set = new Set<LoginMethod>();
  if (configured.password) set.add("password");
  if (configured.passkey) set.add("passkey");
  if (configured.magicLink) set.add("magic_link");
  if (configured.sso) set.add("sso");
  for (const provider of configured.social) set.add(provider);
  return set;
}

export function LoginMethodsCard({
  configured,
  enabledMethods,
  isOwner,
}: {
  /** Which methods are actually configured (ignoring the allow-list). */
  configured: AvailableLoginMethods;
  /** The admin's saved allow-list. Empty = "auto". */
  enabledMethods: LoginMethod[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const configuredSet = useMemo(
    () => toConfiguredSet(configured),
    [configured],
  );

  // "Auto" when the saved allow-list is empty: show everything configured.
  const [customize, setCustomize] = useState(enabledMethods.length > 0);
  // Selection is only meaningful in customize mode. Seed it from the saved
  // list, or from everything configured when switching on for the first time.
  const [selected, setSelected] = useState<Set<LoginMethod>>(
    () => new Set(enabledMethods),
  );

  function handleToggleCustomize(on: boolean) {
    setCustomize(on);
    if (on && selected.size === 0) {
      // Pre-select the currently-configured methods so turning on "custom"
      // doesn't momentarily read as "nothing selected".
      setSelected(new Set(configuredSet));
    }
  }

  function toggleMethod(method: LoginMethod, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(method);
      else next.delete(method);
      return next;
    });
  }

  function handleSave() {
    // Auto mode persists as an empty array; custom mode persists the selection
    // intersected with what's configured (never save an unusable method).
    const payload: LoginMethod[] = customize
      ? LOGIN_METHODS.filter(
          (m) => selected.has(m) && configuredSet.has(m),
        )
      : [];

    if (customize && payload.length === 0) {
      toast.error("Select at least one configured method, or turn off customization.");
      return;
    }

    startTransition(async () => {
      const result = await updateEnabledLoginMethodsAction(payload);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update login methods.");
        return;
      }
      toast.success(
        customize
          ? "Login methods updated."
          : "Login screen will show all configured methods.",
      );
      router.refresh();
    });
  }

  const activeCount = customize
    ? LOGIN_METHODS.filter((m) => selected.has(m) && configuredSet.has(m)).length
    : configuredSet.size;

  return (
    <Card className="gap-5 p-6">
      <SectionHeader
        icon={SsoDuotoneIcon}
        title="Sign-in methods"
        description="Choose which authentication methods appear on the staff login screen. Methods that aren't configured are never shown."
        badge={
          <StatusPill tone={customize ? "on" : "off"}>
            {customize ? `${activeCount} selected` : "Auto (all configured)"}
          </StatusPill>
        }
        action={
          isOwner ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Customize</span>
              <Switch
                checked={customize}
                onCheckedChange={handleToggleCustomize}
                disabled={isPending}
                aria-label="Customize which login methods are shown"
              />
            </div>
          ) : null
        }
      />

      {!isOwner ? (
        <p className="text-xs text-muted-foreground">
          Only workspace owners can change this setting.
        </p>
      ) : (
        <>
          {!customize ? (
            <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              The login screen automatically shows every method you&apos;ve
              configured. Turn on <span className="font-medium">Customize</span>{" "}
              to restrict staff to a specific set (for example, SSO only).
            </p>
          ) : (
            <div className="space-y-2">
              {LOGIN_METHODS.map((method) => {
                const isConfigured = configuredSet.has(method);
                const isOn = selected.has(method) && isConfigured;
                return (
                  <div
                    key={method}
                    className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {METHOD_META[method].label}
                        {!isConfigured ? (
                          <span className="ml-2 align-middle">
                            <StatusPill tone="off">Not configured</StatusPill>
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {METHOD_META[method].hint}
                      </p>
                    </div>
                    <Switch
                      checked={isOn}
                      onCheckedChange={(v) => toggleMethod(method, v)}
                      disabled={isPending || !isConfigured}
                      aria-label={`Show ${METHOD_META[method].label} on the login screen`}
                    />
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                A method must be configured before it can be shown. Configure
                OAuth providers and enterprise SSO above, and email delivery in
                the email settings.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-pine-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
