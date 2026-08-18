import { Controller, Get, Head, Inject, Param, Res, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as path from 'path';
import { STORAGE_SERVICE, IStorageService } from '../common/interfaces/storage.interface';
import { MetadataCacheService } from '../services/metadata-cache.service';
import { ValidateUploadIdPipe } from '../common/pipes/validate-upload-id.pipe';

@Controller()
export class AppInfoController {
  private readonly logger = new Logger(AppInfoController.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
    private readonly metadataCacheService: MetadataCacheService,
  ) {}

  @Get('app/:id')
  serveInstallPage(@Res() res: Response): void {
    const installHtml = path.join(process.cwd(), 'public', 'install.html');
    res.sendFile(installHtml);
  }

  @Get('apps')
  serveAppsPage(@Res() res: Response): void {
    const appsHtml = path.join(process.cwd(), 'public', 'apps.html');
    res.sendFile(appsHtml);
  }

  @Get('api/app/:id')
  async getAppMetadata(
    @Param('id', ValidateUploadIdPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const baseUrl = this.configService.get<string>('app.baseUrl');
    const metadataKey = `${id}/metadata.json`;

    let metadata: any;
    try {
      const cached = this.metadataCacheService.get(metadataKey);
      let metadataBuffer: Buffer;
      if (cached) {
        metadataBuffer = cached;
      } else {
        metadataBuffer = await this.storageService.readFile(metadataKey);
        this.metadataCacheService.set(metadataKey, metadataBuffer);
      }
      metadata = JSON.parse(metadataBuffer.toString('utf-8'));
    } catch (err: any) {
      if (
        err.name === 'NoSuchKey' ||
        err.$metadata?.httpStatusCode === 404 ||
        err.code === 'ENOENT'
      ) {
        res.status(HttpStatus.NOT_FOUND).json({
          error: 'App not found or link has expired',
        });
        return;
      }
      this.logger.error(`Corrupted metadata for ${id}:`, err);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Corrupted app metadata',
      });
      return;
    }

    res.json({
      metadata,
      iconUrl: `${baseUrl}/api/icon/${id}`,
      itmsLink: `itms-services://?action=download-manifest&url=${encodeURIComponent(`${baseUrl}/api/manifest/${id}`)}`,
    });
  }

  @Get('api/icon/:id')
  async getIcon(
    @Param('id', ValidateUploadIdPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const iconKey = `${id}/icon.png`;
    const defaultIcon = path.join(process.cwd(), 'public', 'images', 'default-icon.png');

    // 1. Try in-memory cache (populated on upload, avoids any S3 call)
    const cached = this.metadataCacheService.get(iconKey);
    if (cached) {
      res.set('Content-Type', 'image/png');
      res.set('Content-Length', String(cached.length));
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(cached);
      return;
    }

    // 2. Signed URL redirect (S3 mode, cache miss)
    if (this.storageService.getSignedUrl) {
      const signedUrl = await this.storageService.getSignedUrl(iconKey, 7200);
      if (signedUrl) {
        res.redirect(302, signedUrl);
        return;
      }
    }

    // 3. Stream through server (local storage)
    const result = await this.storageService.getFileStream(iconKey);

    if (result) {
      res.set('Content-Type', 'image/png');
      if (result.contentLength !== undefined) {
        res.set('Content-Length', String(result.contentLength));
      }
      result.stream.pipe(res);
    } else {
      res.set('Content-Type', 'image/png');
      res.sendFile(path.resolve(defaultIcon));
    }
  }

  // HEAD must be registered before GET so Express matches it first.
  // iOS sends HEAD to learn Content-Length before the real GET download.
  // Some S3-compatible stores reject HEAD on signed URLs, so we proxy it.
  @Head('api/download/:id')
  async downloadIpaHead(
    @Param('id', ValidateUploadIdPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    // Try to get file size from cached metadata first (no S3 call).
    // Falls back to S3 HeadObject only on cache miss.
    const metadataKey = `${id}/metadata.json`;
    const cached = this.metadataCacheService.get(metadataKey);
    let fileSize: number | undefined;

    if (cached) {
      try {
        const meta = JSON.parse(cached.toString('utf-8'));
        fileSize = meta.fileSize;
      } catch {
        // Corrupted cache entry — fall through to S3
      }
    }

    if (fileSize === undefined) {
      const ipaKey = `${id}/app.ipa`;
      const info = this.storageService.getFileInfo
        ? await this.storageService.getFileInfo(ipaKey)
        : await this.storageService.getFileStream(ipaKey);

      if (!info) {
        res.status(HttpStatus.NOT_FOUND).end();
        return;
      }
      fileSize = info.contentLength;
    }

    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment; filename="app.ipa"');
    if (fileSize !== undefined) {
      res.set('Content-Length', String(fileSize));
    }
    res.status(HttpStatus.OK).end();
  }

  @Get('api/download/:id')
  async downloadIpa(
    @Param('id', ValidateUploadIdPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const ipaKey = `${id}/app.ipa`;
    const proxyDownloads = this.configService.get<boolean>('app.s3.proxyDownloads', false);

    // If storage supports signed URLs and proxy mode is off, redirect to S3
    if (!proxyDownloads && this.storageService.getSignedUrl) {
      const signedUrl = await this.storageService.getSignedUrl(ipaKey, 7200);
      if (signedUrl) {
        res.redirect(302, signedUrl);
        return;
      }
    }

    // Stream through this server (local storage, proxy mode, or no signed URL)
    const result = await this.storageService.getFileStream(ipaKey);

    if (!result) {
      res.status(HttpStatus.NOT_FOUND).send('File not found');
      return;
    }

    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment; filename="app.ipa"');
    if (result.contentLength !== undefined) {
      res.set('Content-Length', String(result.contentLength));
    }

    result.stream.pipe(res);
  }
}
