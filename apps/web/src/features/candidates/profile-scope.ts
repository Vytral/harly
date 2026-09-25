export function filterApplicationScopedItems<
  T extends { applicationId: string | null },
>(items: readonly T[], visibleApplicationIds: ReadonlySet<string>): T[] {
  return items.filter(
    (item) =>
      item.applicationId === null ||
      visibleApplicationIds.has(item.applicationId),
  );
}
