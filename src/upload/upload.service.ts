import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { IpaParserService } from '../services/ipa-parser.service';
import { QrGeneratorService } from '../services/qr-generator.service';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ipaParser: IpaParserService,
    private readonly qrGenerator: QrGeneratorService,
  ) {}

  async processUpload(file: Express.Multer.File, uploadId: string) {
    const baseUrl = this.configService.get<string>('app.baseUrl');
    const uploadDir = this.configService.get<string>(
      'app.uploadDir',
      './uploads',
    );
    const outputDir = path.dirname(file.path);

    try {
      const metadata = await this.ipaParser.parseIPA(
        file.path,
        outputDir,
      );

      const installUrl = `${baseUrl}/app/${uploadId}`;
      const itmsLink = `itms-services://?action=download-manifest&url=${encodeURIComponent(`${baseUrl}/api/manifest/${uploadId}`)}`;
      const qrCode =
        await this.qrGenerator.generateQRDataURL(installUrl);

      // Enrich metadata
      metadata.id = uploadId;
      metadata.installUrl = installUrl;
      metadata.itmsLink = itmsLink;
      metadata.uploadedAt = new Date().toISOString();
      metadata.fileSize = file.size;

      // Save enriched metadata
      fs.writeFileSync(
        path.join(outputDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
      );

      return {
        success: true,
        id: uploadId,
        metadata,
        installUrl,
        itmsLink,
        qrCode,
        iconUrl: `${baseUrl}/api/icon/${uploadId}`,
      };
    } catch (err) {
      this.logger.error('Upload processing error:', err);

      // Clean up on error
      const dir = path.join(uploadDir, uploadId);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }

      throw err;
    }
  }
}
