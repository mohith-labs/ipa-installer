import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PassThrough, Readable } from 'stream';

/**
 * Disk-based cache for IPA files when using S3 storage.
 *
 * 9Drive (and similar self-hosted S3) has ~10s TTFB and ~1.4 MB/s throughput.
 * This cache stores IPA files on the VPS disk so repeat downloads are instant.
 *
 * - Populated on upload (copy from temp dir before cleanup)
 * - Populated on cache miss (fetch from S3, tee to disk + client)
 * - Evicted on cleanup (when RETENTION_HOURS expires)
 */
@Injectable()
export class IpaCacheService {
  private readonly logger = new Logger(IpaCacheService.name);
  private readonly cacheDir: string;

  constructor() {
    this.cacheDir = path.join(os.tmpdir(), 'ipa-installer-cache');
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.logger.log(`IPA disk cache directory: ${this.cacheDir}`);
  }

  /**
   * Get the cache file path for an upload ID.
   */
  private cachePath(uploadId: string): string {
    return path.join(this.cacheDir, `${uploadId}.ipa`);
  }

  /**
   * Check if an IPA is cached on disk.
   */
  has(uploadId: string): boolean {
    return fs.existsSync(this.cachePath(uploadId));
  }

  /**
   * Get a read stream + file size from the cache. Returns null on miss.
   */
  get(uploadId: string): { stream: Readable; contentLength: number } | null {
    const filePath = this.cachePath(uploadId);
    try {
      const stat = fs.statSync(filePath);
      return {
        stream: fs.createReadStream(filePath),
        contentLength: stat.size,
      };
    } catch {
      return null;
    }
  }

  /**
   * Cache an IPA file by copying from the source path (used during upload).
   * Synchronous to guarantee the copy completes before temp dir cleanup.
   */
  cacheFromPath(uploadId: string, sourcePath: string): void {
    const dest = this.cachePath(uploadId);
    try {
      fs.copyFileSync(sourcePath, dest);
      const stat = fs.statSync(dest);
      this.logger.log(
        `Cached IPA for ${uploadId} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`,
      );
    } catch (err) {
      this.logger.warn(`Failed to cache IPA for ${uploadId}:`, err);
      // Non-fatal — download will fall back to S3
    }
  }

  /**
   * Cache an IPA from a Readable stream (used on cache miss during download).
   * Writes to a temp file first, then atomically renames to avoid serving
   * partial files.
   */
  cacheFromStream(uploadId: string, stream: Readable): Readable {
    const dest = this.cachePath(uploadId);
    const tmp = `${dest}.tmp`;

    const writeStream = fs.createWriteStream(tmp);
    const passThrough = new PassThrough();

    // Tee the S3 stream: one copy to disk, one copy to the client
    stream.pipe(passThrough);
    stream.pipe(writeStream);

    writeStream.on('finish', () => {
      try {
        fs.renameSync(tmp, dest);
      } catch {
        // Clean up temp file on rename failure
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      }
    });

    writeStream.on('error', () => {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    });

    return passThrough;
  }

  /**
   * Remove a cached IPA (called during cleanup).
   */
  evict(uploadId: string): void {
    const filePath = this.cachePath(uploadId);
    try {
      fs.unlinkSync(filePath);
      this.logger.log(`Evicted cached IPA: ${uploadId}`);
    } catch {
      // File may not exist — that's fine
    }
    // Also clean up any leftover temp files
    try {
      fs.unlinkSync(`${filePath}.tmp`);
    } catch { /* ignore */ }
  }
}
