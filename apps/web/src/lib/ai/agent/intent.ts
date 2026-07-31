import "server-only";

export type HarlyIntent =
  | "workspace_fact"
  | "action"
  | "capability"
  | "product_docs"
  | "general_advice"
  | "ambiguous";

/** Lightweight deterministic routing hint; tools remain the source of truth. */
export function classifyHarlyIntent(message: string): HarlyIntent {
  const text = message.trim().toLowerCase();
  if (!text) return "ambiguous";

  if (
    /\b(puede|puedes|puedo|can harly|does harly|integraci[oó]n|conectad[oa]|linkedin|sync|sincroniz)/i.test(
      text,
    )
  ) {
    return "capability";
  }

  if (
    /\b(env[ií]a|manda|mandar|send|rechaza|reject|mueve|move|avanza|advance|agenda|schedule|crea|create|asigna|assign|deshaz|undo)\b/i.test(
      text,
    )
  ) {
    return "action";
  }

  if (
    /\b(c[oó]mo funciona|documentaci[oó]n).*\b(harly|vytral)\b/i.test(text) ||
    /\b(harly|vytral)\b.*\b(funciona|soporta|documentaci[oó]n)\b/i.test(text)
  ) {
    return "product_docs";
  }

  if (
    /\b(mi|mis|m[ií]o|este|esta|actual|workspace|puesto|candidato|aplicaci[oó]n|integraci[oó]n|career page)\b/i.test(
      text,
    )
  ) {
    return "workspace_fact";
  }

  if (
    /\b(buenas pr[aá]cticas|recomendaciones|consejos|c[oó]mo mejorar|what are best practices|general advice)\b/i.test(
      text,
    )
  ) {
    return "general_advice";
  }

  return "ambiguous";
}
