/** Put an item back after an optimistic remove failed. */
export function restoreAtIndex<T extends { id: string }>(
  list: T[],
  index: number,
  item: T,
): T[] {
  if (list.some((row) => row.id === item.id)) return list;
  const next = list.slice();
  next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
  return next;
}
