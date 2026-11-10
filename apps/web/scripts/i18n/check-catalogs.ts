import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCatalogs } from './validate';

const locales = ['en', 'es', 'pt-BR', 'de', 'fr', 'nl-NL'] as const;
try {
  const directories = ['messages', '../../packages/emails/messages'];
  const errors = directories.flatMap((directory) => {
    const catalogs = Object.fromEntries(locales.map((locale) => [locale, JSON.parse(readFileSync(resolve(process.cwd(), directory, `${locale}.json`), 'utf8'))]));
    return validateCatalogs(catalogs.en, Object.fromEntries(locales.filter((locale) => locale !== 'en').map((locale) => [locale, catalogs[locale]]))).map((error) => `${directory}: ${error}`);
  });
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('All locale catalogs have matching keys and valid ICU message signatures.');
} catch (error) { console.error(`Could not read locale catalogs: ${String(error)}`); process.exitCode = 1; }
