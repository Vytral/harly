/**
 * Minimal translator shape for helpers that build visible sentences but are
 * shared with code that has no React context. Components pass the `t` from
 * `useTranslations(namespace)`; server code passes `getTranslations(namespace)`.
 */
export type Translate = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;
