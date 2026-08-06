/** A caller may rotate a key only when it holds every scope on that key. */
export function canRotateApiKeyScopes(
  existingScopes: readonly string[],
  callerScopes: readonly string[],
): boolean {
  return existingScopes.every((scope) => callerScopes.includes(scope));
}
