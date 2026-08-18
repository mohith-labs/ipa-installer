import { Controller, Get, Inject, Param, Res, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { ManifestGeneratorService } from '../services/manifest-generator.service';
import { STORAGE_SERVICE, IStorageService } from '../common/interfaces/storage.interface';
import { ValidateUploadIdPipe } from '../common/pipes/validate-upload-id.pipe';

@Controller('api')
export class ManifestController {
  private readonly logger = new Logger(ManifestController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly manifestGenerator: ManifestGeneratorService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
  ) {}

  @Get('manifest/:id')
  async getManifest(
    @Param('id', ValidateUploadIdPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const baseUrl = this.configService.get<string>('app.baseUrl');
    const metadataKey = `${id}/metadata.json`;

    const exists = await this.storageService.fileExists(metadataKey);
    if (!exists) {
      res.status(HttpStatus.NOT_FOUND).send('App not found');
      return;
    }

    const metadataBuffer = await this.storageService.readFile(metadataKey);

    let metadata: any;
    try {
      metadata = JSON.parse(metadataBuffer.toString('utf-8'));
    } catch {
      this.logger.error(`Corrupted metadata for ${id}`);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Corrupted app metadata',
      });
      return;
    }

    // When storage supports signed URLs (S3), embed direct download links
    // in the manifest so iOS downloads from S3 without proxying through
    // this server. Falls back to proxy URLs for local storage.
    let ipaUrl = `${baseUrl}/api/download/${id}`;
    let iconUrl = `${baseUrl}/api/icon/${id}`;

    if (this.storageService.getSignedUrl) {
      const [signedIpa, signedIcon] = await Promise.all([
        this.storageService.getSignedUrl(`${id}/app.ipa`, 7200),
        this.storageService.getSignedUrl(`${id}/icon.png`, 7200),
      ]);
      if (signedIpa) ipaUrl = signedIpa;
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
