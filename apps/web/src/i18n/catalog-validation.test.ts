import { describe, expect, it } from 'vitest';
import { validateCatalogs } from '../../scripts/i18n/validate';

describe('catalog validation', () => {
  it('accepts locale-specific plural categories', () => {
    const source = { text: '{count, plural, one {# item} other {# items}}' };
    const targets = { fr: { text: '{count, plural, one {# élément} many {# éléments} other {# éléments}}' } };
    expect(validateCatalogs(source, targets)).toEqual([]);
  });

  it('rejects missing, extra, empty and invalid messages', () => {
    const errors = validateCatalogs({ missing: 'Missing', empty: 'Empty', bad: 'Hello', keep: 'Keep' }, {
      es: { empty: '', bad: '{value, plural, one {uno}}', keep: 'Mantener', extra: 'Extra' },
    });
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('missing: missing key'), expect.stringContaining('extra: unexpected key'),
      expect.stringContaining('empty: empty message'), expect.stringContaining('bad: invalid ICU'),
    ]));
  });

  it('detects missing arguments and rich text tags, including nested plural branches', () => {
    const source = { text: '{count, plural, one {<link>{name}</link>} other {<link>{name}</link>}}' };
    const errors = validateCatalogs(source, { de: { text: '{count, plural, one {<link>Hallo</link>} other {Hallo}}' } });
    expect(errors.join('\n')).toContain('argument:name');
  });

  it('detects select options and exact plural branches that change behavior', () => {
    const source = { a: '{gender, select, female {She} male {He} other {They}}', b: '{count, plural, =0 {None} other {#}}' };
    const errors = validateCatalogs(source, { fr: { a: '{gender, select, female {Elle} other {Iel}}', b: '{count, plural, other {#}}' } });
    expect(errors).toHaveLength(2);
  });
});

describe('project catalogs', () => {
  it('match the English catalog and contain valid ICU messages', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const locales = ['en', 'es', 'pt-BR', 'de', 'fr', 'nl-NL'];
    const catalogs = Object.fromEntries(locales.map((locale) => [locale, JSON.parse(readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8'))]));
    const { en, ...targets } = catalogs;
    expect(validateCatalogs(en, targets)).toEqual([]);
  });
});
