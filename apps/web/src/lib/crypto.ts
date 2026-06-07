import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Authenticated symmetric encryption for secrets at rest (AI provider API keys).
 *
 * AES-256-GCM with a 12-byte random IV per encryption. The master key comes from
 * `AI_ENCRYPTION_KEY` (base64-encoded 32 bytes). Generate one with:
 *   openssl rand -base64 32
 *
 * Ciphertext, IV and auth tag are stored separately (all base64). The key is
 * only ever read server-side; plaintext secrets never leave the server.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function getKey(): Buffer {
  const raw = process.env.AI_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      "AI_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== KEY_BYTES) {
    throw new Error(
      "AI_ENCRYPTION_KEY must be a base64-encoded 32-byte key (e.g. `openssl rand -base64 32`).",
    );
  }

  return key;
}

/** True when a valid 32-byte master key is configured (used to gate AI features). */
export function isEncryptionConfigured(): boolean {
  const raw = process.env.AI_ENCRYPTION_KEY;
  if (!raw) {
    return false;
  }
  try {
    return Buffer.from(raw, "base64").length === KEY_BYTES;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(secret.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
