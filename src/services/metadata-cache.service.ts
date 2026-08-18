import { Injectable } from '@nestjs/common';

@Injectable()
export class MetadataCacheService {
  private readonly cache = new Map<string, { data: Buffer; cachedAt: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  get(key: string): Buffer | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: Buffer): void {
    this.cache.set(key, { data, cachedAt: Date.now() });
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
