import { randomUUID } from "node:crypto";
import os from "node:os";
import { readPrefs, updatePrefs, type Prefs } from "./prefs.js";

/**
 * Anonymous, opt-in install telemetry.
 *
 * PLACEHOLDER: this default collector URL is not live. The owner must point it
 * at a real collector (or set HARLY_TELEMETRY_URL) before relying on the data.
 */
export const DEFAULT_TELEMETRY_URL = "https://telemetry.harly.dev/v1/events";
export const TELEMETRY_TIMEOUT_MS = 2_000;
export const TELEMETRY_SCHEMA = 1;

export const REFERRAL_OPTIONS = [
  { value: "github", label: "GitHub" },
  { value: "search", label: "Search engine" },
  { value: "friend", label: "Friend or colleague" },
  { value: "social", label: "Social media" },
  { value: "blog_video", label: "Blog or video" },
  { value: "other", label: "Other" },
  { value: "skip", label: "Skip" },
] as const;
export type Referral = (typeof REFERRAL_OPTIONS)[number]["value"];

export type TelemetryEvent = "install_completed";

/** Exactly what leaves the machine. Nothing else is ever added. */
export type TelemetryPayload = {
  schema: typeof TELEMETRY_SCHEMA;
  event: TelemetryEvent;
  instanceId: string;
  cliVersion: string;
  os: string;
  arch: string;
  deployMode?: string;
  referral?: Exclude<Referral, "skip">;
};

const OFF = new Set(["0", "false", "off", "no"]);
const ON = new Set(["1", "true", "on", "yes"]);

/** HARLY_TELEMETRY=0 or DO_NOT_TRACK=1 always win over any stored consent. */
export function telemetryOptedOutByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const own = env.HARLY_TELEMETRY?.trim().toLowerCase();
  if (own && OFF.has(own)) return true;
  const dnt = env.DO_NOT_TRACK?.trim().toLowerCase();
  return Boolean(dnt && dnt !== "0" && dnt !== "false");
}

export function telemetryOptedInByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const own = env.HARLY_TELEMETRY?.trim().toLowerCase();
  return Boolean(own && ON.has(own));
}

export type ConsentDecision = "send" | "ask" | "off";

/**
 * Pure consent resolution. Order: explicit opt-out (flag, env) beats everything;
 * an explicit opt-in (flag, env) or a stored yes allows sending; a stored no is
 * respected; an undecided user is asked only in an interactive terminal and is
 * otherwise treated as "no".
 */
export function resolveConsent(input: {
  prefs: Prefs;
  env?: NodeJS.ProcessEnv;
  noTelemetryFlag?: boolean;
  telemetryFlag?: boolean;
  interactive: boolean;
}): ConsentDecision {
  const env = input.env ?? process.env;
  if (input.noTelemetryFlag || telemetryOptedOutByEnv(env)) return "off";
  if (input.telemetryFlag || telemetryOptedInByEnv(env)) return "send";
  const stored = input.prefs.telemetry?.enabled;
  if (stored === true) return "send";
  if (stored === false) return "off";
  return input.interactive ? "ask" : "off";
}

export function telemetryUrl(env: NodeJS.ProcessEnv = process.env): string {
  const custom = env.HARLY_TELEMETRY_URL?.trim();
  return custom && /^https?:\/\//i.test(custom) ? custom : DEFAULT_TELEMETRY_URL;
}

export function newInstanceId(): string {
  return randomUUID();
}

/** Builds the payload from an explicit allowlist; unknown input is ignored. */
export function buildPayload(input: {
  instanceId: string;
  cliVersion: string;
  event?: TelemetryEvent;
  deployMode?: string;
  referral?: Referral;
  platform?: string;
  arch?: string;
}): TelemetryPayload {
  const mode = input.deployMode && /^[a-z0-9_-]{1,32}$/i.test(input.deployMode) ? input.deployMode : undefined;
  return {
    schema: TELEMETRY_SCHEMA,
    event: input.event ?? "install_completed",
    instanceId: input.instanceId,
    cliVersion: input.cliVersion,
    os: input.platform ?? os.platform(),
    arch: input.arch ?? os.arch(),
    ...(mode ? { deployMode: mode } : {}),
    ...(input.referral && input.referral !== "skip" ? { referral: input.referral } : {}),
  };
}

/** Fire-and-forget POST. Resolves false instead of ever throwing or hanging. */
export async function sendTelemetry(
  payload: TelemetryPayload,
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<boolean> {
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(telemetryUrl(options.env), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? TELEMETRY_TIMEOUT_MS),
      redirect: "error",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function setTelemetryConsent(
  enabled: boolean,
  env: NodeJS.ProcessEnv = process.env,
  referral?: Referral,
): Promise<{ saved: boolean; instanceId?: string }> {
  let instanceId: string | undefined;
  const saved = await updatePrefs((current) => {
    instanceId = enabled ? current.telemetry?.instanceId ?? newInstanceId() : current.telemetry?.instanceId;
    return {
      ...current,
      telemetry: {
        enabled,
        instanceId,
        decidedAt: new Date().toISOString(),
        ...(referral ? { referral } : current.telemetry?.referral ? { referral: current.telemetry.referral } : {}),
      },
    };
  }, env);
  return { saved, instanceId: enabled ? instanceId : undefined };
}

export async function telemetryStatus(input: {
  env?: NodeJS.ProcessEnv;
  noTelemetryFlag?: boolean;
  telemetryFlag?: boolean;
}): Promise<{ enabled: boolean; reason: string; url: string; instanceId?: string }> {
  const env = input.env ?? process.env;
  const prefs = await readPrefs(env);
  const decision = resolveConsent({ prefs, env, noTelemetryFlag: input.noTelemetryFlag, telemetryFlag: input.telemetryFlag, interactive: false });
  const reason = input.noTelemetryFlag
    ? "disabled by --no-telemetry"
    : telemetryOptedOutByEnv(env)
      ? "disabled by HARLY_TELEMETRY=0 or DO_NOT_TRACK"
      : input.telemetryFlag || telemetryOptedInByEnv(env)
        ? "enabled explicitly for this run"
        : prefs.telemetry?.enabled === true
          ? "enabled by your saved choice"
          : prefs.telemetry?.enabled === false
            ? "disabled by your saved choice"
            : "not decided yet, nothing is sent";
  return { enabled: decision === "send", reason, url: telemetryUrl(env), instanceId: prefs.telemetry?.instanceId };
}

/** The plain-language disclosure shown before asking, and by `telemetry status`. */
export const TELEMETRY_DISCLOSURE = [
  "Help improve Harly by sharing anonymous install statistics once, when setup finishes.",
  "Sent: a random ID generated on this machine, the CLI version, OS and CPU architecture,",
  "the deployment mode (for example caddy or external proxy), and your optional answer below.",
  "Never sent: your domain, email, company name, IP-derived data, hostnames or secrets.",
  "Change your mind anytime with `harly telemetry disable`, --no-telemetry or HARLY_TELEMETRY=0.",
].join("\n");

/** Convenience used by init: sends once if consent allows. Never throws. */
export async function reportInstall(input: {
  prefs: Prefs;
  env?: NodeJS.ProcessEnv;
  noTelemetryFlag?: boolean;
  telemetryFlag?: boolean;
  cliVersion: string;
  deployMode?: string;
  referral?: Referral;
}): Promise<boolean> {
  try {
    const env = input.env ?? process.env;
    const decision = resolveConsent({ ...input, env, interactive: false });
    if (decision !== "send") return false;
    // An explicit per-run yes without stored consent uses a throwaway id.
    const instanceId = input.prefs.telemetry?.instanceId ?? newInstanceId();
    return await sendTelemetry(
      buildPayload({
        instanceId,
        cliVersion: input.cliVersion,
        deployMode: input.deployMode,
        referral: input.referral ?? input.prefs.telemetry?.referral,
      }),
      { env },
    );
  } catch {
    return false;
  }
}
