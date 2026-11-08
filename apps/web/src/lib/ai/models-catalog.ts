import "server-only";

/**
 * Catálogo de modelos de IA alimentado por https://models.dev con respaldo sin red.
 *
 * Uso
 *   const { providers, source, fetchedAt } = await getCatalog();
 *   const { models } = await getProviderModels("anthropic");   // no deprecados primero, recientes primero
 *   await getCatalog({ forceRefresh: true });                  // ignora TTL y backoff
 *   `source`: "live" (descargado en esta llamada) | "cache" (memoria) | "snapshot" (repo).
 *
 * Los ids de proveedor/modelo son los de models.dev (sin remapear). Precios en USD
 * por millón de tokens; contexto y salida en tokens.
 *
 * Entorno
 *   HARLY_MODELS_DEV=0              solo snapshot, nunca se hace red (instalaciones aisladas).
 *   HARLY_MODELS_DEV_TTL_HOURS=24   vida de la caché en memoria.
 *   HARLY_MODELS_DEV_URL            URL alternativa; debe ser https (por defecto https://models.dev/api.json).
 *
 * Política de caché
 *   - Caché en proceso con TTL. Pasado el TTL se intenta refrescar (timeout 4 s); si
 *     falla se sirve la última caché buena, y si no la hay, el snapshot.
 *   - Peticiones concurrentes comparten una sola descarga (single-flight).
 *   - Tras un fallo hay backoff exponencial (30 s, 1 min, ... máx. 1 h) sin reintentar.
 *   - Seguridad: GET sin cookies ni credenciales, solo User-Agent "Harly"; no se envía
 *     ningún dato del usuario. Respuesta limitada a 15 MB; redirecciones solo dentro del
 *     mismo host (máx. 3); JSON validado con Zod, modelos mal formados se descartan.
 *   - Snapshot: src/lib/ai/models-snapshot.json, regenerado con `pnpm ai:models:update`
 *     (criterio en models-catalog-normalize.ts: chat con tool_call, no deprecados,
 *     25 modelos más recientes por proveedor).
 *   - Los logs solo registran origen y recuentos.
 */
import snapshotJson from "./models-snapshot.json";
import {
  compareModels,
  normalizeApi,
  type CatalogModel,
  type CatalogProvider,
} from "./models-catalog-normalize";

export type { CatalogModel, CatalogProvider };
export type CatalogSource = "live" | "cache" | "snapshot";

const DEFAULT_URL = "https://models.dev/api.json";
const TIMEOUT_MS = 4000;
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;

type CatalogResult = { providers: CatalogProvider[]; source: CatalogSource; fetchedAt: string };
type Cache = { providers: CatalogProvider[]; fetchedAtMs: number };

let cache: Cache | null = null;
let inflight: Promise<Cache> | null = null;
let failures = 0;
let retryAfterMs = 0;

const snapshot = snapshotJson as { generatedAt: string; providers: CatalogProvider[] };

function enabled(): boolean {
  return process.env.HARLY_MODELS_DEV !== "0";
}

function ttlMs(): number {
  const h = Number(process.env.HARLY_MODELS_DEV_TTL_HOURS);
  return (Number.isFinite(h) && h > 0 ? h : 24) * 3_600_000;
}

function resolveUrl(): URL {
  const raw = process.env.HARLY_MODELS_DEV_URL?.trim();
  if (!raw) return new URL(DEFAULT_URL);
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("HARLY_MODELS_DEV_URL debe ser https");
  return u;
}

function snapshotResult(): CatalogResult {
  return { providers: snapshot.providers, source: "snapshot", fetchedAt: snapshot.generatedAt };
}

function log(source: CatalogSource, providers: number, note?: string) {
  console.info(`[models-catalog] source=${source} providers=${providers}${note ? ` ${note}` : ""}`);
}

async function readLimited(res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new Error("respuesta demasiado grande");
  if (!res.body) {
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error("respuesta demasiado grande");
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("respuesta demasiado grande");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function download(): Promise<Cache> {
  const start = resolveUrl();
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url.toString(), {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "manual",
      signal,
      headers: { "User-Agent": "Harly", Accept: "application/json" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("redirección sin destino");
      const next = new URL(loc, url);
      if (next.protocol !== "https:" || next.host !== start.host) {
        throw new Error("redirección a otro host rechazada");
      }
      url = next;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: unknown = JSON.parse(await readLimited(res));
    const providers = normalizeApi(json);
    if (providers.every((p) => p.models.length === 0)) throw new Error("catálogo vacío");
    return { providers, fetchedAtMs: Date.now() };
  }
  throw new Error("demasiadas redirecciones");
}

function refresh(): Promise<Cache> {
  if (!inflight) {
    inflight = download()
      .then((c) => {
        cache = c;
        failures = 0;
        retryAfterMs = 0;
        return c;
      })
      .catch((err: unknown) => {
        failures += 1;
        retryAfterMs = Date.now() + Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
        throw err;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function fromCache(c: Cache): CatalogResult {
  return { providers: c.providers, source: "cache", fetchedAt: new Date(c.fetchedAtMs).toISOString() };
}

export async function getCatalog(opts?: {
  forceRefresh?: boolean;
}): Promise<{ providers: CatalogProvider[]; source: CatalogSource; fetchedAt: string }> {
  if (!enabled()) return snapshotResult();
  const force = opts?.forceRefresh === true;
  const now = Date.now();
  if (cache && !force && now - cache.fetchedAtMs < ttlMs()) return fromCache(cache);
  if (!force && !inflight && now < retryAfterMs) return cache ? fromCache(cache) : snapshotResult();
  try {
    const c = await refresh();
    log("live", c.providers.length);
    return {
      providers: c.providers,
      source: "live",
      fetchedAt: new Date(c.fetchedAtMs).toISOString(),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "error";
    const fallback = cache ? fromCache(cache) : snapshotResult();
    log(fallback.source, fallback.providers.length, `fallback=${reason}`);
    return fallback;
  }
}

export async function getProviderModels(
  providerId: string,
  opts?: { forceRefresh?: boolean },
): Promise<{ models: CatalogModel[]; source: CatalogSource; fetchedAt: string }> {
  const { providers, source, fetchedAt } = await getCatalog(opts);
  const models = [...(providers.find((p) => p.id === providerId)?.models ?? [])].sort(compareModels);
  return { models, source, fetchedAt };
}

/** Solo para tests: reinicia caché, backoff y petición en curso. */
export function __resetCatalogForTests(): void {
  cache = null;
  inflight = null;
  failures = 0;
  retryAfterMs = 0;
}
