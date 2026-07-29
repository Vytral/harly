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
   * Write bytes from a trusted server-side integration (for example a signed
   * document downloaded from DocuSign). Browser uploads should still use the
   * presigned URL flow above.
   */
  put(key: string, content: Buffer, contentType: string): Promise<void>;

  /**
   * Delete a file by key.
   */
  delete(key: string): Promise<void>;

  /** List keys below a trusted namespace for reconciliation/maintenance jobs. */
  list(prefix: string): Promise<string[]>;
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
