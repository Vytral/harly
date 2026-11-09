import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';

type Catalog = Record<string, unknown>;

function flatten(value: unknown, path = ''): Record<string, string> {
  if (typeof value === 'string') return { [path]: value };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path || '<root>'}: expected a message or namespace`);
  }
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    if (!key || key.includes('.')) throw new Error(`${path || '<root>'}: invalid key ${JSON.stringify(key)}`);
    return Object.entries(flatten(child, path ? `${path}.${key}` : key));
  }));
}

function signature(message: string): string[] {
  const result = new Set<string>();
  const visit = (nodes: MessageFormatElement[]) => {
    for (const node of nodes) {
      if (node.type === TYPE.literal || node.type === TYPE.pound) continue;
      result.add(`${TYPE[node.type]}:${node.value}`);
      if (node.type === TYPE.tag) visit(node.children);
      if (node.type === TYPE.select || node.type === TYPE.plural) {
        if (node.type === TYPE.select) {
          for (const key of Object.keys(node.options)) result.add(`select-option:${node.value}:${key}`);
        } else {
          result.add(`plural-type:${node.value}:${node.pluralType}:${node.offset}`);
          for (const key of Object.keys(node.options).filter((key) => key.startsWith('='))) result.add(`plural-exact:${node.value}:${key}`);
        }
        for (const option of Object.values(node.options)) visit(option.value);
      }
    }
  };
  visit(parse(message, { requiresOtherClause: true }));
  return [...result].sort();
}

/** Returns actionable diagnostics; no locale-specific plural categories are required to match English. */
export function validateCatalogs(source: Catalog, targets: Record<string, Catalog>): string[] {
  const errors: string[] = [];
  let original: Record<string, string>;
  try { original = flatten(source); } catch (error) { return [`en: ${String(error)}`]; }
  const sourceSignatures: Record<string, string[]> = {};
  for (const [key, message] of Object.entries(original)) {
    if (!message.trim()) errors.push(`en: ${key}: empty message`);
    try { sourceSignatures[key] = signature(message); } catch (error) { errors.push(`en: ${key}: invalid ICU: ${String(error)}`); }
  }
  for (const [locale, catalog] of Object.entries(targets)) {
    let translated: Record<string, string>;
    try { translated = flatten(catalog); } catch (error) { errors.push(`${locale}: ${String(error)}`); continue; }
    for (const key of Object.keys(original)) if (!(key in translated)) errors.push(`${locale}: ${key}: missing key`);
    for (const [key, message] of Object.entries(translated)) {
      if (!(key in original)) { errors.push(`${locale}: ${key}: unexpected key`); continue; }
      if (!message.trim()) errors.push(`${locale}: ${key}: empty message`);
      try {
        const actual = signature(message);
        const expected = sourceSignatures[key];
        if (expected && JSON.stringify(actual) !== JSON.stringify(expected)) {
          errors.push(`${locale}: ${key}: ICU arguments or tags differ (expected ${expected.join(', ') || 'none'}; got ${actual.join(', ') || 'none'})`);
        }
      } catch (error) { errors.push(`${locale}: ${key}: invalid ICU: ${String(error)}`); }
    }
  }
  return errors;
}
