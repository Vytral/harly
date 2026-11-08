/**
 * Regenera src/lib/ai/models-snapshot.json descargando https://models.dev/api.json.
 * Uso: pnpm --filter web ai:models:update   (requiere red; revisar el diff y commitear).
 * Criterio de contenido: ver buildSnapshot() en src/lib/ai/models-catalog-normalize.ts.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildSnapshot } from "../src/lib/ai/models-catalog-normalize";

const URL_ = process.env.HARLY_MODELS_DEV_URL ?? "https://models.dev/api.json";
const OUT = path.resolve(__dirname, "../src/lib/ai/models-snapshot.json");

async function main() {
  if (!URL_.startsWith("https://")) throw new Error("La URL debe ser https");
  const res = await fetch(URL_, { headers: { "User-Agent": "Harly" } });
  if (!res.ok) throw new Error(`models.dev respondió ${res.status}`);
  const json: unknown = await res.json();
  const now = new Date();
  const providers = buildSnapshot(json, now);
  const total = providers.reduce((n, p) => n + p.models.length, 0);
  if (providers.length === 0 || total === 0) throw new Error("Snapshot vacío; no se escribe");
  const body = JSON.stringify({ generatedAt: now.toISOString(), source: "https://models.dev/api.json", providers });
  writeFileSync(OUT, body + "\n");
  console.log(`Snapshot: ${providers.length} proveedores, ${total} modelos, ${(body.length / 1024).toFixed(0)} KiB -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
