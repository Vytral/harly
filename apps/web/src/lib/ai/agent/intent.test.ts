import { describe, expect, it } from "vitest";

import { classifyHarlyIntent } from "./intent";

describe("Harly intent routing", () => {
  it.each([
    ["¿Cuál es el estado actual de mi puesto?", "workspace_fact"],
    ["¿Puedes publicar este puesto en LinkedIn?", "capability"],
    ["Mueve a Ana a entrevista", "action"],
    [
      "Quiero una automatización que mande un email al postular",
      "automation_build",
    ],
    [
      "Me gustaría que cuando un candidato postule espere una hora",
      "automation_build",
    ],
    [
      "Make this workflow smarter by evaluating the candidate first",
      "automation_build",
    ],
    ["¿Cómo funciona Harly?", "product_docs"],
    ["¿Qué buenas prácticas mejoran recruiting?", "general_advice"],
    ["Ayúdame", "ambiguous"],
  ] as const)("routes %s as %s", (message, expected) => {
    expect(classifyHarlyIntent(message)).toBe(expected);
  });
});
