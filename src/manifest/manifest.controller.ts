import { Controller, Get, Param, Res, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { ManifestGeneratorService } from '../services/manifest-generator.service';

@Controller('api')
export class ManifestController {
  constructor(
    private readonly configService: ConfigService,
    private readonly manifestGenerator: ManifestGeneratorService,
  ) {}

  @Get('manifest/:id')
  getManifest(
    @Param('id') id: string,
    @Res() res: Response,
  ): void {
    const uploadDir = this.configService.get<string>(
      'app.uploadDir',
      './uploads',
    );
    const baseUrl = this.configService.get<string>('app.baseUrl');
    const metadataPath = path.join(uploadDir, id, 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      res.status(HttpStatus.NOT_FOUND).send('App not found');
      return;
    }

    const metadata = JSON.parse(
      fs.readFileSync(metadataPath, 'utf8'),
    );

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
