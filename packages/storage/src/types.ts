export type StorageAdapter = {
  /**
   * Generate a presigned URL for direct browser-to-storage upload.
   * Returns { uploadUrl, fileUrl } where:
   * uploadUrl = where the browser PUTs the file
   * fileUrl = permanent URL to access the file after upload
   */
  getPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<{ uploadUrl: string; fileUrl: string }>;

  /**
   * Read a file's bytes by key. Used for server-side processing (e.g. CV parsing).
   */
  read(key: string): Promise<Buffer>;

  /**
   * Delete a file by key.
   */
  delete(key: string): Promise<void>;
};

export type StorageConfig =
  | { provider: "local" }
  | {
      provider: "s3";
      bucket: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      endpoint?: string;
      publicUrl?: string;
    };
