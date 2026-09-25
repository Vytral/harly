import "server-only";

export type HarlyIntent =
  | "workspace_fact"
  | "action"
  | "automation_build"
  | "capability"
  | "product_docs"
  | "general_advice"
  | "ambiguous";

/** Lightweight deterministic routing hint; tools remain the source of truth. */
export function classifyHarlyIntent(message: string): HarlyIntent {
  const text = message.trim().toLowerCase();
  if (!text) return "ambiguous";

  // Automation requests are planning requests, even when they contain an
  // action verb such as "reject" or "send". Keep this ahead of the generic
  // capability/action/workspace checks so natural phrasing reaches the
  // automation orchestration path.
  const mentionsAutomation =
    /\b(automat(?:izaci[oó]n|izacion|ion)|workflow|flujo|disparador|trigger)\w*/i.test(
      text,
    );
  const hasBuildIntent =
    /\b(quier[oa]|want|need|would like|necesito|me gustar[ií]a|haz(?:me)?|make|modify|update|improve|crear|crea|armar|configurar|configura|construir|diseñar|dise[nñ]a|build|set up|cuando|when|whenever)\b/i.test(
      text,
    );
  const describesWorkflow =
    /\b(whenever|cuando|automatically|autom[aá]ticamente|if|si)\b[\s\S]*\b(apply|applies|applicant|candidate|candidat[oa]s?|position|role|contact|email|evaluate|evaluat|puntaje|score)\b/i.test(
      text,
    );
  if (
    (mentionsAutomation && hasBuildIntent) ||
    (hasBuildIntent && describesWorkflow) ||
    describesWorkflow ||
    (hasBuildIntent &&
      /\b(cuando|when)\b.*\b(candidat[oa]s?|applicant|postulant)\b/i.test(
        text,
      )) ||
    (/\b(cuando|when)\b.*\b(candidat[oa]s?|applicant|postulant)\b/i.test(
      text,
    ) &&
      /\b(rechaz|reject|email|correo|borr|delete|puntaje|score|evalu)/i.test(
        text,
      ))
  ) {
    return "automation_build";
  }

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
