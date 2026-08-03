export type NativeSnapshotField = {
  id: string;
  type: "signature" | "text";
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string | null;
  required?: boolean;
  order?: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidSnapshotField(value: unknown): value is NativeSnapshotField {
  if (!value || typeof value !== "object") return false;
  const field = value as Record<string, unknown>;
  return (
    typeof field.id === "string" &&
    (field.type === "signature" || field.type === "text") &&
    Number.isInteger(field.page) &&
    (field.page as number) > 0 &&
    isFiniteNumber(field.x) &&
    field.x >= 0 &&
    field.x <= 1 &&
    isFiniteNumber(field.y) &&
    field.y >= 0 &&
    field.y <= 1 &&
    isFiniteNumber(field.w) &&
    field.w > 0 &&
    field.w <= 1 &&
    isFiniteNumber(field.h) &&
    field.h > 0 &&
    field.h <= 1 &&
    (field.label === undefined || field.label === null || typeof field.label === "string") &&
    (field.required === undefined || typeof field.required === "boolean") &&
    (field.order === undefined || Number.isInteger(field.order))
  );
}

/** A native offer is signable only after a valid frozen layout is saved. */
export function isSignableNativeFieldsSnapshot(
  value: unknown,
): value is NativeSnapshotField[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  if (!value.every(isValidSnapshotField)) return false;
  return value.some(
    (field) => field.type === "signature" && field.required !== false,
  );
}

export function isNativeOfferAcceptanceAvailable(input: {
  offerStatus: string;
  applicationStatus: string;
  expiresAt: Date | null;
  now?: Date;
}): boolean {
  if (input.offerStatus !== "sent" || input.applicationStatus !== "active") {
    return false;
  }
  return !input.expiresAt || input.expiresAt.getTime() > (input.now ?? new Date()).getTime();
}
