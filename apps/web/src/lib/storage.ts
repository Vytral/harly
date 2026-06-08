import { createStorage, type StorageConfig } from "@harly/storage";

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required when STORAGE_PROVIDER=s3.`);
  }

  return value;
}

const config: StorageConfig =
  process.env.STORAGE_PROVIDER === "s3"
    ? {
        provider: "s3",
        bucket: requiredEnv("S3_BUCKET"),
        region: process.env.S3_REGION ?? "auto",
        accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
        endpoint: process.env.S3_ENDPOINT || undefined,
        publicUrl: process.env.S3_PUBLIC_URL || undefined,
      }
    : { provider: "local" };

export const storageProvider = config.provider;
export const storage = createStorage(config);
