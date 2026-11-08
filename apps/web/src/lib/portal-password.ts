import {
  createHash,
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * Candidate-portal password and one-time-code primitives. No database access:
 * everything here is deterministic or random and unit tested in isolation.
 *
 * Passwords use scrypt (Node built-in, memory-hard) with a per-password random
 * salt. The stored string is self-describing so parameters can be raised later
 * without invalidating existing hashes.
 */

const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
// 128 * N * r = 32 MiB; leave headroom above that.
const MAXMEM = 64 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

function scrypt(
  password: string,
  salt: Buffer,
  keyLen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keyLen, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAXMEM,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (![N, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (salt.length === 0 || expected.length === 0) return false;
  try {
    const actual = await scrypt(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: Math.max(MAXMEM, 128 * N * r * 2),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;
/**
 * Burns the same work as a real verification so unknown emails and wrong
 * passwords take comparable time.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
  return false;
}

export type PasswordPolicyResult = { ok: true } | { ok: false; error: string };

export function validatePasswordPolicy(
  password: string,
  context: { email?: string } = {},
): PasswordPolicyResult {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      error: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
    };
  }
  const lower = password.toLowerCase();
  const email = context.email?.toLowerCase().trim();
  if (email && (lower === email || lower === email.split("@")[0])) {
    return { ok: false, error: "Password must not be your email address." };
  }
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, error: "Choose a less repetitive password." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// One-time codes. Only SHA-256 hashes are stored; the inputs are high entropy
// random values (not human-chosen), so a fast hash is appropriate.
// ---------------------------------------------------------------------------

export function hashCode(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** 192-bit URL-safe token for access codes and reset links. */
export function generateLongCode(): string {
  return randomBytes(24).toString("base64url");
}

/** Constant-time string equality for secrets of possibly different length. */
export function safeEqual(a: string, b: string): boolean {
  const ab = createHash("sha256").update(a).digest();
  const bb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ab, bb);
}

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols, no 0/O/1/I

/** 16 symbols * 5 bits = 80 bits, shown as XXXX-XXXX-XXXX-XXXX. */
export function generateRecoveryCode(): string {
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    if (i % 4 === 3 && i < 15) out += "-";
  }
  return out;
}

export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(input: string): string {
  return hashCode(`recovery:${normalizeRecoveryCode(input)}`);
}
