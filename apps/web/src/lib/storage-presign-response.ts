export type StoragePresignResponse = {
  uploadUrl: string;
  fileUrl: string;
  key: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoragePresignResponse(
  value: unknown,
): value is StoragePresignResponse {
  return (
    isRecord(value) &&
    typeof value.uploadUrl === "string" &&
    typeof value.fileUrl === "string" &&
    typeof value.key === "string"
  );
}

/** Accept authenticated raw responses and public v1 `{ data }` envelopes. */
export function parseStoragePresignResponse(
  value: unknown,
): StoragePresignResponse | null {
  if (isStoragePresignResponse(value)) return value;
  if (isRecord(value) && isStoragePresignResponse(value.data)) {
    return value.data;
  }
  return null;
}
