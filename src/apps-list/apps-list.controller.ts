import { Controller, Get, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_SERVICE, IStorageService } from '../common/interfaces/storage.interface';
import { IAppMetadata } from '../common/interfaces/app-metadata.interface';
import { MetadataCacheService } from '../services/metadata-cache.service';

@Controller('api')
export class AppsListController {
  private readonly logger = new Logger(AppsListController.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
    private readonly metadataCacheService: MetadataCacheService,
  ) {}

  @Get('apps')
  async listApps(): Promise<{
    success: boolean;
    apps: Array<IAppMetadata & { iconUrl: string }>;
  }> {
    const baseUrl = this.configService.get<string>('app.baseUrl');

    let dirs: string[];
    try {
      dirs = await this.storageService.listDirectories();
    } catch (err) {
      this.logger.error('Failed to list upload directories:', err);
      return { success: true, apps: [] };
    }

    const apps: Array<IAppMetadata & { iconUrl: string }> = [];

    const results = await Promise.allSettled(
      dirs.map(async (dir) => {
        const metadataKey = `${dir}/metadata.json`;
        let metadataBuffer: Buffer;
        const cached = this.metadataCacheService.get(metadataKey);
        if (cached) {
          metadataBuffer = cached;
        } else {
          metadataBuffer = await this.storageService.readFile(metadataKey);
          this.metadataCacheService.set(metadataKey, metadataBuffer);
        }
        const metadata: IAppMetadata = JSON.parse(
          metadataBuffer.toString('utf-8'),
        );

        // Ensure the id is set (in case of older uploads)
        if (!metadata.id) {
          metadata.id = dir;
        }

        return {
          ...metadata,
          iconUrl: `${baseUrl}/api/icon/${dir}`,
        };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        apps.push(result.value);
      }
    }

    // Sort by uploadedAt descending (newest first)
    apps.sort((a, b) => {
      const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return dateB - dateA;
    });

    return { success: true, apps };
  }
}
