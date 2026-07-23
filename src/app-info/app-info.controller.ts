import { Controller, Get, Inject, Param, Res, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as path from 'path';
import { STORAGE_SERVICE, IStorageService } from '../common/interfaces/storage.interface';
import { ValidateUploadIdPipe } from '../common/pipes/validate-upload-id.pipe';

@Controller()
export class AppInfoController {
  private readonly logger = new Logger(AppInfoController.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
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

    const exists = await this.storageService.fileExists(metadataKey);
    if (!exists) {
      res.status(HttpStatus.NOT_FOUND).json({
        error: 'App not found or link has expired',
      });
      return;
    }

    const metadataBuffer = await this.storageService.readFile(metadataKey);

    let metadata: any;
    try {
      metadata = JSON.parse(metadataBuffer.toString('utf-8'));
    } catch {
      this.logger.error(\`Corrupted metadata for \${id}\`);
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

    // Single S3/fs call — gets stream + size together, returns null if missing
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

  @Get('api/download/:id')
  async downloadIpa(
    @Param('id', ValidateUploadIdPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const ipaKey = `${id}/app.ipa`;

    // Single S3/fs call — gets stream + content-length in one request.
    // This is critical for iOS OTA: without Content-Length the device shows
    // "Waiting..." indefinitely because it can't determine download progress.
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
