import { Readable } from 'stream';

export const STORAGE_SERVICE = 'STORAGE_SERVICE';

export interface IFileStreamResult {
  stream: Readable;
  contentLength?: number;
  contentType?: string;
}

export interface IFileInfo {
  contentLength?: number;
  contentType?: string;
}

export interface IStorageService {
  /**
   * Save a file to storage.
   * @param key - Storage key (e.g., "<uploadId>/app.ipa")
   * @param data - File contents as Buffer or Readable stream
   * @param contentType - Optional MIME type
   */
  saveFile(key: string, data: Buffer | Readable, contentType?: string): Promise<void>;

  /**
   * Read a file from storage into a Buffer.
   */
  readFile(key: string): Promise<Buffer>;

  /**
   * Read a file from storage as a Readable stream.
   */
  readFileStream(key: string): Promise<Readable>;

  /**
   * Check whether a file exists in storage.
   */
  fileExists(key: string): Promise<boolean>;

  /**
   * Delete all files under a given prefix (i.e., an upload directory).
   * @param prefix - The directory/prefix to delete (e.g., "<uploadId>")
   */
  deleteDirectory(prefix: string): Promise<void>;

  /**
   * List all top-level upload directories/prefixes.
   * Returns an array of upload IDs.
   */
  listDirectories(): Promise<string[]>;

  /**
   * Get the last-modified timestamp for a file.
   * Returns undefined if the file does not exist.
   */
  getLastModified(key: string): Promise<Date | undefined>;

  /**
   * Get a file as a stream along with its size and content type in a single call.
   * Returns null if the file does not exist.
   */
  getFileStream(key: string): Promise<IFileStreamResult | null>;

  /**
   * Get file metadata (size, type) without reading the file body.
   * Returns null if the file does not exist.
   */
  getFileInfo?(key: string): Promise<IFileInfo | null>;

  /**
   * Generate a pre-signed URL for direct client access to a file.
   * Returns null if the storage backend does not support signed URLs.
   * @param key - Storage key
   * @param expiresInSeconds - URL validity duration (default 3600)
   */
  getSignedUrl?(key: string, expiresInSeconds?: number): Promise<string | null>;
}
