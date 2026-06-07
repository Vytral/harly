import { LocalAdapter } from "./adapters/local";
import { S3Adapter } from "./adapters/s3";
import type { StorageAdapter, StorageConfig } from "./types";

export function createStorage(config: StorageConfig): StorageAdapter {
  if (config.provider === "local") {
    return new LocalAdapter();
  }

  return new S3Adapter(config);
}

export * from "./types";
