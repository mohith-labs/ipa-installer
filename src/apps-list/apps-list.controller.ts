import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_SERVICE, IStorageService } from '../common/interfaces/storage.interface';
import { IAppMetadata } from '../common/interfaces/app-metadata.interface';
import { MetadataCacheService } from '../services/metadata-cache.service';

type AppListItem = IAppMetadata & { iconUrl: string };

interface IPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
// Short TTL: a full listing is O(number of uploads) storage reads, so the
// sorted index is reused across the page requests of a single scroll session
// while still picking up new uploads promptly.
const INDEX_TTL = 15 * 1000;

@Controller('api')
export class AppsListController {
  private readonly logger = new Logger(AppsListController.name);

  private indexCache: { apps: AppListItem[]; cachedAt: number } | null = null;
  private indexInFlight: Promise<AppListItem[]> | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
    private readonly metadataCacheService: MetadataCacheService,
  ) {}

  @Get('apps')
  async listApps(
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ): Promise<{
    success: boolean;
    apps: AppListItem[];
    pagination: IPagination;
  }> {
    const limit = this.parseLimit(limitRaw);
    const offset = this.parseOffset(offsetRaw);

    const allApps = await this.getSortedApps();

    const total = allApps.length;
    const page = allApps.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const hasMore = nextOffset < total;

    return {
      success: true,
      apps: page,
      pagination: {
        total,
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? nextOffset : null,
      },
    };
  }

  /**
   * Build (or reuse) the full list of apps sorted by uploadedAt descending.
   * Concurrent callers share a single in-flight build so a burst of page
   * requests never triggers parallel full scans of the storage backend.
   */
  private async getSortedApps(): Promise<AppListItem[]> {
    const cached = this.indexCache;
    if (cached && Date.now() - cached.cachedAt < INDEX_TTL) {
      return cached.apps;
    }

    if (this.indexInFlight) {
      return this.indexInFlight;
    }

    this.indexInFlight = this.buildSortedApps()
      .then((apps) => {
        this.indexCache = { apps, cachedAt: Date.now() };
        return apps;
      })
      .finally(() => {
        this.indexInFlight = null;
      });

    return this.indexInFlight;
  }

  private async buildSortedApps(): Promise<AppListItem[]> {
    const baseUrl = this.configService.get<string>('app.baseUrl');

    let dirs: string[];
    try {
      dirs = await this.storageService.listDirectories();
    } catch (err) {
      this.logger.error('Failed to list upload directories:', err);
      return [];
    }

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

    const apps: AppListItem[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        apps.push(result.value);
      }
    }

    // Sort by uploadedAt descending (newest first). Ties are broken by id so
    // the ordering is stable across requests — otherwise paging through the
    // list could repeat or skip entries.
    apps.sort((a, b) => {
      const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      if (dateB !== dateA) {
        return dateB - dateA;
      }
      return (a.id || '').localeCompare(b.id || '');
    });

    return apps;
  }

  private parseLimit(raw?: string): number {
    if (raw === undefined || raw === '') {
      return DEFAULT_LIMIT;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      throw new HttpException(
        { success: false, error: 'limit must be a positive integer' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return Math.min(value, MAX_LIMIT);
  }

  private parseOffset(raw?: string): number {
    if (raw === undefined || raw === '') {
      return 0;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new HttpException(
        { success: false, error: 'offset must be a non-negative integer' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return value;
  }
}
