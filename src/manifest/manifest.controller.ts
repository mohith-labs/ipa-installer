import { Controller, Get, Inject, Param, Res, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { ManifestGeneratorService } from '../services/manifest-generator.service';
import { STORAGE_SERVICE, IStorageService } from '../common/interfaces/storage.interface';
import { MetadataCacheService } from '../services/metadata-cache.service';
import { ValidateUploadIdPipe } from '../common/pipes/validate-upload-id.pipe';

@Controller('api')
export class ManifestController {
  private readonly logger = new Logger(ManifestController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly manifestGenerator: ManifestGeneratorService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
    private readonly metadataCacheService: MetadataCacheService,
  ) {}

  @Get('manifest/:id')
  async getManifest(
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
      // readFile throws on missing key (NoSuchKey / ENOENT)
      if (
        err.name === 'NoSuchKey' ||
        err.$metadata?.httpStatusCode === 404 ||
        err.code === 'ENOENT'
      ) {
        res.status(HttpStatus.NOT_FOUND).send('App not found');
        return;
      }
      this.logger.error(`Failed to read metadata for ${id}:`, err);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Corrupted app metadata',
      });
      return;
    }

    // Use signed URL for direct S3 download when available.
    // 9Drive accepts HEAD on GET-signed URLs, so iOS can get Content-Length
    // without a proxy hop. Falls back to the proxy endpoint for local storage
    // or if signed URL generation fails.
    let ipaUrl = `${baseUrl}/api/download/${id}`;
    let iconUrl = `${baseUrl}/api/icon/${id}`;

    if (this.storageService.getSignedUrl) {
      const signedIpa = await this.storageService.getSignedUrl(`${id}/app.ipa`, 7200);
      if (signedIpa) ipaUrl = signedIpa;

      const signedIcon = await this.storageService.getSignedUrl(`${id}/icon.png`, 7200);
      if (signedIcon) iconUrl = signedIcon;
    }

    const manifestXml = this.manifestGenerator.generateManifest({
      ipaUrl,
      iconUrl,
      bundleId: metadata.bundleId,
      version: metadata.version,
      title: metadata.name,
    });

    res.set('Content-Type', 'text/xml');
    res.send(manifestXml);
  }
}
