import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { STORAGE_SERVICE, IStorageService } from '../common/interfaces/storage.interface';
import { MetadataCacheService } from '../services/metadata-cache.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
    private readonly metadataCacheService: MetadataCacheService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup(): Promise<void> {
    const retentionHours = this.configService.get<number>('app.retentionHours', 48);
    const retentionMs = retentionHours * 60 * 60 * 1000;
    const now = Date.now();

    let dirs: string[];
    try {
      dirs = await this.storageService.listDirectories();
    } catch (err) {
      this.logger.error('Failed to list upload directories for cleanup:', err);
      return;
    }

    for (const dir of dirs) {
      try {
        // Try to read metadata.json first for accurate uploadedAt timestamp
        const metadataKey = `${dir}/metadata.json`;
        const exists = await this.storageService.fileExists(metadataKey);

        if (exists) {
          const metadataBuffer = await this.storageService.readFile(metadataKey);
          const meta = JSON.parse(metadataBuffer.toString('utf-8'));
          const uploadedAt = new Date(meta.uploadedAt).getTime();

          if (now - uploadedAt > retentionMs) {
            await this.storageService.deleteDirectory(dir);
            this.metadataCacheService.invalidatePrefix(dir);
            this.logger.log(`Cleaned up expired upload: ${dir}`);
          }
        } else {
          // Fallback: check last-modified timestamp of any file in the directory
          // Use the IPA file as a proxy for the upload time
          const ipaKey = `${dir}/app.ipa`;
          const lastModified = await this.storageService.getLastModified(ipaKey);

          if (lastModified && now - lastModified.getTime() > retentionMs) {
            await this.storageService.deleteDirectory(dir);
            this.metadataCacheService.invalidatePrefix(dir);
            this.logger.log(`Cleaned up stale upload directory: ${dir}`);
          }
        }
      } catch {
        // Directory may have been removed between list and check — ignore
      }
    }
  }
}
