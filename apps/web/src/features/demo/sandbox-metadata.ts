/**
 * Marker stored in `organization.metadata` for per-visitor demo sandboxes. It
 * is how the server tells a disposable sandbox apart from the canonical demo
 * template workspace; never derived from anything the browser sends.
 */
export type DemoSandboxMetadata = {
  expiresAt: string;
  style: string;
};

const KEY = "harlyDemoSandbox";

export function serializeSandboxMetadata(meta: DemoSandboxMetadata): string {
  return JSON.stringify({ [KEY]: meta });
}

export function parseSandboxMetadata(
  raw: string | null | undefined,
): DemoSandboxMetadata | null {
  if (!raw) return null;
  try {
    const value = (JSON.parse(raw) as Record<string, unknown> | null)?.[KEY];
    if (!value || typeof value !== "object") return null;
    const { expiresAt, style } = value as Record<string, unknown>;
    if (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt))) {
      return null;
    }
    return { expiresAt, style: typeof style === "string" ? style : "" };
  } catch {
    return null;
  }
}

export function isSandboxExpired(
  meta: DemoSandboxMetadata,
  now: Date = new Date(),
): boolean {
  return Date.parse(meta.expiresAt) <= now.getTime();
}
