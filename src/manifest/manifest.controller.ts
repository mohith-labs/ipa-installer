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
      this.logger.error(\`Corrupted metadata for \${id}\`);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Corrupted app metadata',
      });
      return;
    }

    const manifestXml = this.manifestGenerator.generateManifest({
      ipaUrl: `${baseUrl}/api/download/${id}`,
      iconUrl: `${baseUrl}/api/icon/${id}`,
      bundleId: metadata.bundleId,
      version: metadata.version,
      title: metadata.name,
    });

    res.set('Content-Type', 'text/xml');
    res.send(manifestXml);
  }
}
