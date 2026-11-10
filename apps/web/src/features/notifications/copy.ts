/**
 * Notification text is stored once, in English, when the event happens. That
 * is the fallback. Producers also store a `copy` descriptor in the row's
 * metadata (a catalog key plus its values) so the inbox can render the text in
 * the viewer's language instead of whoever triggered the event.
 *
 * Catalog layout: `labels.notifications.<key>.title` and, optionally,
 * `labels.notifications.<key>.body`.
 */
export type NotificationCopy = {
  key: string;
  values?: Record<string, string | number>;
};

type Translate = {
  (key: string, values?: Record<string, string | number>): string;
  has: (key: string) => boolean;
};

/** Metadata with the copy descriptor merged in. */
export function withNotificationCopy(
  metadata: Record<string, unknown> | undefined,
  copy: NotificationCopy,
): Record<string, unknown> {
  return { ...(metadata ?? {}), copy };
}

function readCopy(metadata: unknown): NotificationCopy | null {
  if (!metadata || typeof metadata !== "object") return null;
  const copy = (metadata as { copy?: unknown }).copy;
  if (!copy || typeof copy !== "object") return null;
  const { key, values } = copy as { key?: unknown; values?: unknown };
  if (typeof key !== "string" || key.length === 0) return null;
  return {
    key,
    values:
      values && typeof values === "object"
        ? (values as Record<string, string | number>)
        : undefined,
  };
}

/** Localised title/body, or the stored English text when there is no copy. */
export function localizeNotification(
  row: { title: string; body: string | null; metadata: unknown },
  t: Translate,
): { title: string; body: string | null } {
  const copy = readCopy(row.metadata);
  if (!copy) return { title: row.title, body: row.body };
  const titleKey = `${copy.key}.title`;
  const bodyKey = `${copy.key}.body`;
  return {
    title: t.has(titleKey) ? t(titleKey, copy.values) : row.title,
    body: t.has(bodyKey) ? t(bodyKey, copy.values) : row.body,
  };
}
