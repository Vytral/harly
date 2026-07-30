/** Escape PostgreSQL ILIKE metacharacters in user-controlled search input. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
