/**
 * Normalización pura del formato de https://models.dev/api.json (sin server-only
 * ni red), compartida por `models-catalog.ts` y `scripts/update-models-snapshot.ts`.
 *
 * - Zod tolerante: campos desconocidos se ignoran; un modelo mal formado se
 *   descarta sin romper el resto; un proveedor mal formado se descarta entero.
 * - Unidades: contextWindow/maxOutput en tokens, costes en USD por millón de tokens.
 * - `deprecated`: models.dev marca status="deprecated" (o `deprecated: true`), o el
 *   modelo salió hace más de DEPRECATED_AFTER_MONTHS meses.
 */
import { z } from "zod";

export type CatalogModel = {
  id: string;
  name: string;
  providerId: string;
  contextWindow?: number;
  maxOutput?: number;
  toolCall?: boolean;
  reasoning?: boolean;
  attachments?: boolean;
  inputCostPerM?: number;
  outputCostPerM?: number;
  releaseDate?: string;
  openWeights?: boolean;
  deprecated?: boolean;
};
export type CatalogProvider = {
  id: string;
  name: string;
  api?: string;
  npm?: string;
  env?: string[];
  doc?: string;
  models: CatalogModel[];
};

/** Un modelo con más de 36 meses desde su lanzamiento se considera obsoleto. */
export const DEPRECATED_AFTER_MONTHS = 36;

const num = z.number().finite().nonnegative();
const rawModelSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200).optional(),
  attachment: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  tool_call: z.boolean().optional(),
  release_date: z.string().max(32).optional(),
  open_weights: z.boolean().optional(),
  status: z.string().max(32).optional(),
  deprecated: z.boolean().optional(),
  type: z.string().max(32).optional(),
  modalities: z
    .object({ input: z.array(z.string()).optional(), output: z.array(z.string()).optional() })
    .optional(),
  limit: z.object({ context: num.optional(), output: num.optional() }).partial().optional(),
  cost: z.object({ input: num.optional(), output: num.optional() }).partial().optional(),
});
const rawProviderSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200).optional(),
  api: z.string().max(500).optional(),
  npm: z.string().max(200).optional(),
  env: z.array(z.string().max(100)).max(20).optional(),
  doc: z.string().max(500).optional(),
  models: z.record(z.string(), z.unknown()).optional(),
});

function isOld(releaseDate: string | undefined, now: Date): boolean {
  if (!releaseDate) return false;
  const t = Date.parse(releaseDate);
  if (Number.isNaN(t)) return false;
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() - DEPRECATED_AFTER_MONTHS);
  return t < limit.getTime();
}

export function normalizeModel(
  raw: unknown,
  providerId: string,
  now: Date,
): CatalogModel | null {
  const r = rawModelSchema.safeParse(raw);
  if (!r.success) return null;
  const m = r.data;
  const out: CatalogModel = { id: m.id, name: m.name ?? m.id, providerId };
  if (m.limit?.context !== undefined) out.contextWindow = m.limit.context;
  if (m.limit?.output !== undefined) out.maxOutput = m.limit.output;
  if (m.tool_call !== undefined) out.toolCall = m.tool_call;
  if (m.reasoning !== undefined) out.reasoning = m.reasoning;
  if (m.attachment !== undefined) out.attachments = m.attachment;
  if (m.cost?.input !== undefined) out.inputCostPerM = m.cost.input;
  if (m.cost?.output !== undefined) out.outputCostPerM = m.cost.output;
  if (m.release_date) out.releaseDate = m.release_date;
  if (m.open_weights !== undefined) out.openWeights = m.open_weights;
  if (m.status === "deprecated" || m.deprecated === true || isOld(m.release_date, now)) {
    out.deprecated = true;
  }
  return out;
}

/** Convierte el JSON crudo de models.dev. Lanza solo si la raíz no es un objeto. */
export function normalizeApi(json: unknown, now: Date = new Date()): CatalogProvider[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("models.dev: respuesta con forma inesperada");
  }
  const providers: CatalogProvider[] = [];
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    const p = rawProviderSchema.safeParse(value);
    if (!p.success) continue;
    const id = p.data.id || key;
    const models: CatalogModel[] = [];
    for (const rawModel of Object.values(p.data.models ?? {})) {
      const m = normalizeModel(rawModel, id, now);
      if (m) models.push(m);
    }
    const prov: CatalogProvider = { id, name: p.data.name ?? id, models };
    if (p.data.api) prov.api = p.data.api;
    if (p.data.npm) prov.npm = p.data.npm;
    if (p.data.env) prov.env = p.data.env;
    if (p.data.doc) prov.doc = p.data.doc;
    providers.push(prov);
  }
  return providers;
}

/** Orden: no deprecados primero, más recientes primero, luego por nombre. */
export function compareModels(a: CatalogModel, b: CatalogModel): number {
  const da = a.deprecated ? 1 : 0;
  const db = b.deprecated ? 1 : 0;
  if (da !== db) return da - db;
  const ra = a.releaseDate ?? "";
  const rb = b.releaseDate ?? "";
  if (ra !== rb) return ra < rb ? 1 : -1;
  return a.name.localeCompare(b.name);
}

/** Máximo de modelos por proveedor en el snapshot (los más recientes). */
export const SNAPSHOT_MAX_MODELS_PER_PROVIDER = 25;

/**
 * Criterio del snapshot: solo modelos de texto/chat con tool_call (los que Harly
 * puede usar como agente), no deprecados, salida con modalidad "text"; por
 * proveedor se conservan los SNAPSHOT_MAX_MODELS_PER_PROVIDER más recientes.
 * Los proveedores sin modelos útiles se omiten. `rawJson` es el JSON crudo.
 */
export function buildSnapshot(rawJson: unknown, now: Date = new Date()): CatalogProvider[] {
  const raw = rawJson as Record<string, { models?: Record<string, { type?: string; modalities?: { output?: string[] } }> }>;
  const providers = normalizeApi(rawJson, now);
  const result: CatalogProvider[] = [];
  for (const p of providers) {
    const rawProv = Object.values(raw).find((x) => (x as { id?: string }).id === p.id);
    const rawModels = rawProv?.models ?? {};
    const models = p.models
      .filter((m) => {
        const r = rawModels[m.id];
        const outText = !r?.modalities?.output || r.modalities.output.includes("text");
        const typeOk = !r?.type || r.type === "chat";
        return m.toolCall === true && !m.deprecated && outText && typeOk;
      })
      .sort(compareModels)
      .slice(0, SNAPSHOT_MAX_MODELS_PER_PROVIDER);
    if (models.length > 0) result.push({ ...p, models });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
