import { Injectable } from '@nestjs/common';

@Injectable()
export class MetadataCacheService {
  // Metadata is immutable after upload. No TTL needed — entries are
  // invalidated only when the cleanup service deletes an upload.
  private readonly cache = new Map<string, Buffer>();

  get(key: string): Buffer | null {
    return this.cache.get(key) ?? null;
  }

  set(key: string, data: Buffer): void {
    this.cache.set(key, data);
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}
