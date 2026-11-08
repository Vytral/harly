import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import snapshotJson from "./models-snapshot.json";
import { __resetCatalogForTests, getCatalog, getProviderModels } from "./models-catalog";
import { buildSnapshot, normalizeApi } from "./models-catalog-normalize";

const API = {
  acme: {
    id: "acme",
    name: "Acme",
    api: "https://api.acme.test/v1",
    npm: "@ai-sdk/acme",
    env: ["ACME_API_KEY"],
    doc: "https://acme.test/docs",
    unknownField: 1,
    models: {
      old: { id: "old", name: "Old", release_date: "2020-01-01", tool_call: true, limit: { context: 8000, output: 1000 } },
      dep: { id: "dep", name: "Dep", release_date: "2026-01-01", status: "deprecated", tool_call: true },
      new: {
        id: "new", name: "New", release_date: "2026-06-01", tool_call: true, reasoning: true, attachment: true,
        open_weights: false, limit: { context: 200000, output: 64000 }, cost: { input: 3, output: 15, cache_read: 1 },
      },
      mid: { id: "mid", name: "Mid", release_date: "2026-03-01", tool_call: false },
      bad: { name: "no id" },
      bad2: { id: "x", limit: { context: "big" } },
    },
  },
  broken: "nope",
};

function ok(body: unknown = API, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

beforeEach(() => {
  __resetCatalogForTests();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T00:00:00Z"));
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  delete process.env.HARLY_MODELS_DEV;
  delete process.env.HARLY_MODELS_DEV_URL;
  delete process.env.HARLY_MODELS_DEV_TTL_HOURS;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("normalizeApi", () => {
  it("parsea, normaliza unidades y descarta modelos y proveedores mal formados", () => {
    const providers = normalizeApi(API, new Date("2026-11-07"));
    expect(providers.map((p) => p.id)).toEqual(["acme"]);
    const p = providers[0];
    expect(p).toMatchObject({ name: "Acme", npm: "@ai-sdk/acme", env: ["ACME_API_KEY"], doc: "https://acme.test/docs" });
    expect(p.models.map((m) => m.id).sort()).toEqual(["dep", "mid", "new", "old"]);
    expect(p.models.find((m) => m.id === "new")).toEqual({
      id: "new", name: "New", providerId: "acme", contextWindow: 200000, maxOutput: 64000, toolCall: true,
      reasoning: true, attachments: true, inputCostPerM: 3, outputCostPerM: 15, releaseDate: "2026-06-01", openWeights: false,
    });
  });
  it("marca deprecated por status o por antigüedad", () => {
    const p = normalizeApi(API, new Date("2026-11-07"))[0];
    const dep = (id: string) => p.models.find((m) => m.id === id)?.deprecated;
    expect(dep("dep")).toBe(true);
    expect(dep("old")).toBe(true);
    expect(dep("new")).toBeUndefined();
  });
  it("rechaza una raíz que no es objeto", () => {
    expect(() => normalizeApi([])).toThrow();
  });
});

describe("getCatalog", () => {
  it("descarga en vivo con petición GET sin credenciales y luego usa caché", async () => {
    const f = vi.fn(async () => ok());
    vi.stubGlobal("fetch", f);
    const a = await getCatalog();
    expect(a.source).toBe("live");
    const init = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[0]).toBe("https://models.dev/api.json");
    expect(init[1]).toMatchObject({ method: "GET", credentials: "omit", redirect: "manual", headers: { "User-Agent": "Harly", Accept: "application/json" } });
    const b = await getCatalog();
    expect(b.source).toBe("cache");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("TTL: tras expirar revalida; forceRefresh ignora el TTL", async () => {
    const f = vi.fn(async () => ok());
    vi.stubGlobal("fetch", f);
    process.env.HARLY_MODELS_DEV_TTL_HOURS = "1";
    await getCatalog();
    vi.setSystemTime(new Date("2026-11-07T00:59:00Z"));
    expect((await getCatalog()).source).toBe("cache");
    vi.setSystemTime(new Date("2026-11-07T01:01:00Z"));
    expect((await getCatalog()).source).toBe("live");
    expect(f).toHaveBeenCalledTimes(2);
    expect((await getCatalog({ forceRefresh: true })).source).toBe("live");
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("error de red sin caché cae al snapshot; con caché devuelve la última buena", async () => {
    const f = vi.fn().mockRejectedValue(new Error("net"));
    vi.stubGlobal("fetch", f);
    const a = await getCatalog();
    expect(a.source).toBe("snapshot");
    expect(a.providers.length).toBeGreaterThan(0);

    __resetCatalogForTests();
    f.mockResolvedValueOnce(ok());
    await getCatalog();
    f.mockRejectedValue(new Error("net"));
    vi.setSystemTime(new Date("2026-11-09T00:00:00Z"));
    const b = await getCatalog();
    expect(b.source).toBe("cache");
    expect(b.providers[0].id).toBe("acme");
  });

  it("timeout cae al snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    expect((await getCatalog()).source).toBe("snapshot");
  });

  it("backoff tras fallo: no reintenta hasta que pasa la espera", async () => {
    const f = vi.fn().mockRejectedValue(new Error("net"));
    vi.stubGlobal("fetch", f);
    await getCatalog();
    await getCatalog();
    expect(f).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-11-07T00:01:00Z"));
    await getCatalog();
    expect(f).toHaveBeenCalledTimes(2);
    await getCatalog({ forceRefresh: true });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("single-flight: peticiones concurrentes comparten una descarga", async () => {
    const f = vi.fn(async () => ok());
    vi.stubGlobal("fetch", f);
    const r = await Promise.all([getCatalog(), getCatalog(), getProviderModels("acme")]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.every((x) => x.source === "live")).toBe(true);
  });

  it("rechaza una respuesta enorme (content-length y flujo)", async () => {
    const f = vi.fn(async () => ok(API, { headers: { "content-length": String(50 * 1024 * 1024) } }));
    vi.stubGlobal("fetch", f);
    expect((await getCatalog()).source).toBe("snapshot");

    __resetCatalogForTests();
    const chunk = new Uint8Array(4 * 1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(c) { c.enqueue(chunk); },
    });
    f.mockResolvedValue(new Response(body, { status: 200 }));
    expect((await getCatalog()).source).toBe("snapshot");
  });

  it("HARLY_MODELS_DEV=0 solo usa el snapshot y no hace red", async () => {
    process.env.HARLY_MODELS_DEV = "0";
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await getCatalog({ forceRefresh: true });
    expect(r.source).toBe("snapshot");
    expect(f).not.toHaveBeenCalled();
  });

  it("rechaza redirección a otro host y acepta la del mismo host", async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://evil.example/api.json" } }));
    vi.stubGlobal("fetch", f);
    expect((await getCatalog()).source).toBe("snapshot");
    expect(f).toHaveBeenCalledTimes(1);

    __resetCatalogForTests();
    f.mockReset();
    f.mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/v2/api.json" } }));
    f.mockResolvedValueOnce(ok());
    expect((await getCatalog()).source).toBe("live");
    expect(f.mock.calls[1][0]).toBe("https://models.dev/v2/api.json");
  });

  it("HARLY_MODELS_DEV_URL debe ser https", async () => {
    process.env.HARLY_MODELS_DEV_URL = "http://models.dev/api.json";
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await getCatalog()).source).toBe("snapshot");
    expect(f).not.toHaveBeenCalled();
  });

  it("JSON inválido o vacío cae al snapshot", async () => {
    const f = vi.fn(async () => new Response("<html>", { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect((await getCatalog()).source).toBe("snapshot");
  });
});

describe("getProviderModels", () => {
  it("ordena: no deprecados primero y más recientes primero", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const { models } = await getProviderModels("acme");
    expect(models.map((m) => m.id)).toEqual(["new", "mid", "dep", "old"]);
  });
  it("proveedor desconocido devuelve lista vacía", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    expect((await getProviderModels("nope")).models).toEqual([]);
  });
});

describe("snapshot del repo", () => {
  it("cumple el esquema y no está vacío", () => {
    const snap = snapshotJson as { generatedAt: string; providers: unknown[] };
    expect(Number.isNaN(Date.parse(snap.generatedAt))).toBe(false);
    expect(snap.providers.length).toBeGreaterThan(10);
    const normalized = normalizeApi(
      Object.fromEntries(
        (snap.providers as { id: string; models: { id: string }[] }[]).map((p) => [
          p.id,
          { ...p, models: Object.fromEntries(p.models.map((m) => [m.id, { ...m, tool_call: true }])) },
        ]),
      ),
    );
    expect(normalized.length).toBe(snap.providers.length);
    for (const p of snap.providers as { id: string; models: { id: string; name: string; providerId: string; toolCall?: boolean }[] }[]) {
      expect(p.models.length).toBeGreaterThan(0);
      for (const m of p.models) {
        expect(m.id && m.name).toBeTruthy();
        expect(m.providerId).toBe(p.id);
        expect(m.toolCall).toBe(true);
      }
    }
    expect(JSON.stringify(snap).length).toBeLessThan(2 * 1024 * 1024);
  });
  it("buildSnapshot aplica el criterio (tool_call, no deprecados, texto)", () => {
    const out = buildSnapshot(API, new Date("2026-11-07"));
    expect(out[0].models.map((m) => m.id)).toEqual(["new"]);
  });
});
