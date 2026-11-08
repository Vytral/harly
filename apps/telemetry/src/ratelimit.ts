import { createHmac, randomBytes } from "node:crypto";

const SALT_ROTATION_MS = 3600 * 1000;

type Bucket = { tokens: number; updatedAt: number };

/**
 * In-memory token bucket per origin. The key is HMAC(salt, ip) with a random
 * per-process salt rotated hourly, so raw IPs are never stored and a key can't
 * be linked across rotations. Rotation also drops all buckets.
 */
export class RateLimiter {
  private salt = randomBytes(32);
  private saltAt: number;
  private readonly buckets = new Map<string, Bucket>();
  private lastPrune: number;

  constructor(
    private readonly perMinute: number,
    private readonly burst: number,
    private readonly maxKeys: number,
    private readonly now: () => number = Date.now,
  ) {
    this.saltAt = this.lastPrune = now();
  }

  get size(): number {
    return this.buckets.size;
  }

  /** Returns 0 if allowed, otherwise the seconds to wait before retrying. */
  check(ip: string): number {
    const t = this.now();
    if (t - this.saltAt >= SALT_ROTATION_MS) {
      this.salt = randomBytes(32);
      this.saltAt = t;
      this.buckets.clear();
    }
    // A bucket idle long enough to be full again carries no information.
    const fullAfterMs = (this.burst / this.perMinute) * 60_000;
    if (t - this.lastPrune >= 60_000 || this.buckets.size >= this.maxKeys) {
      for (const [key, bucket] of this.buckets) if (t - bucket.updatedAt >= fullAfterMs) this.buckets.delete(key);
      this.lastPrune = t;
    }
    const key = createHmac("sha256", this.salt).update(ip).digest("hex");
    const existing = this.buckets.get(key);
    let bucket: Bucket;
    if (existing) {
      bucket = existing;
      bucket.tokens = Math.min(this.burst, bucket.tokens + ((t - bucket.updatedAt) / 60_000) * this.perMinute);
      bucket.updatedAt = t;
      this.buckets.delete(key); // re-insert to keep Map order = recency
    } else {
      while (this.buckets.size >= this.maxKeys) {
        const oldest = this.buckets.keys().next().value;
        if (oldest === undefined) break;
        this.buckets.delete(oldest);
      }
      bucket = { tokens: this.burst, updatedAt: t };
    }
    this.buckets.set(key, bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return Math.max(1, Math.ceil(((1 - bucket.tokens) / this.perMinute) * 60));
  }
}
