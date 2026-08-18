import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { IpaParserService } from '../services/ipa-parser.service';
import { QrGeneratorService } from '../services/qr-generator.service';
import { STORAGE_SERVICE, IStorageService } from '../common/interfaces/storage.interface';
import { MetadataCacheService } from '../services/metadata-cache.service';
import { IAppMetadata } from '../common/interfaces/app-metadata.interface';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ipaParser: IpaParserService,
    private readonly qrGenerator: QrGeneratorService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
    private readonly metadataCacheService: MetadataCacheService,
  ) {}

  async processUpload(file: Express.Multer.File, uploadId: string) {
    const baseUrl = this.configService.get<string>('app.baseUrl');
    const storageType = this.configService.get<string>('app.storageType', 'local');
    const outputDir = path.dirname(file.path);

    try {
      // Step 1: Parse IPA from the local temp/upload directory
      const metadata = await this.ipaParser.parseIPA(file.path, outputDir);

      // Step 2: Build URLs and QR code
      const installUrl = `${baseUrl}/app/${uploadId}`;
      const itmsLink = `itms-services://?action=download-manifest&url=${encodeURIComponent(`${baseUrl}/api/manifest/${uploadId}`)}`;
      const qrCode = await this.qrGenerator.generateQRDataURL(installUrl);

      // Step 3: Enrich metadata
      metadata.id = uploadId;
      metadata.installUrl = installUrl;
      metadata.itmsLink = itmsLink;
      metadata.uploadedAt = new Date().toISOString();
      metadata.fileSize = file.size;
      metadata.uploadStatus = storageType === 's3' ? 'uploading' : 'ready';

      const metadataJson = JSON.stringify(metadata, null, 2);

      // Step 4: Persist files to storage
      if (storageType === 's3') {
        // Start all uploads in parallel — metadata, icon, and IPA.
        // We only await metadata + icon (small files needed for the install page).
        // The IPA upload is fire-and-forget with retries.
        const smallUploads: Promise<void>[] = [];

        smallUploads.push(
          this.storageService.saveFile(
            `${uploadId}/metadata.json`,
            Buffer.from(metadataJson, 'utf-8'),
            'application/json',
          ),
        );

        const iconPath = path.join(outputDir, 'icon.png');
        if (fs.existsSync(iconPath)) {
          const iconBuffer = fs.readFileSync(iconPath);
          smallUploads.push(
            this.storageService.saveFile(
              `${uploadId}/icon.png`,
              iconBuffer,
              'image/png',
            ),
          );
        }

        // Fire off the IPA background upload immediately (don't await).
        // Pass metadata so status updates avoid re-reading from S3.
        const ipaPath = path.join(outputDir, 'app.ipa');
        this.uploadIpaInBackground(uploadId, ipaPath, outputDir, metadata);

        // Only block the response on small files
        await Promise.all(smallUploads);
      } else {
        // For local mode, just write the enriched metadata (files already in place)
        fs.writeFileSync(path.join(outputDir, 'metadata.json'), metadataJson);
      }

      // Populate cache so first install page load is instant
      const metadataKey = `${uploadId}/metadata.json`;
      this.metadataCacheService.set(metadataKey, Buffer.from(metadataJson, 'utf-8'));

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
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      // Also attempt to clean up S3 if anything was partially uploaded
      try {
        await this.storageService.deleteDirectory(uploadId);
      } catch {
        // Ignore cleanup errors
      }

      throw err;
    }
  }

  /**
   * Uploads the IPA file to S3 in the background with retry logic and
   * status tracking. Cleans up the temp directory only after success or
   * all retries are exhausted.
   */
  private uploadIpaInBackground(
    uploadId: string,
    ipaPath: string,
    tempDir: string,
    metadata: IAppMetadata,
  ): void {
    const maxRetries = 3;

    const attempt = async (retryCount: number): Promise<void> => {
      try {
        const ipaStream = fs.createReadStream(ipaPath);
        await this.storageService.saveFile(
          `${uploadId}/app.ipa`,
          ipaStream,
          'application/octet-stream',
        );

        // Update metadata to mark the upload as ready
        await this.updateUploadStatus(uploadId, metadata, 'ready');
        this.logger.log(`Background IPA upload complete: ${uploadId}`);
      } catch (err) {
        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          this.logger.warn(
            `Background IPA upload failed for ${uploadId} (attempt ${retryCount + 1}/${maxRetries}), retrying in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return attempt(retryCount + 1);
        }

        this.logger.error(
          `Background IPA upload failed permanently for ${uploadId} after ${maxRetries} attempts:`,
          err,
        );
        await this.updateUploadStatus(uploadId, metadata, 'failed');
      }
    };

    attempt(0).finally(() => {
      // Clean up temp directory after all attempts
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    });
  }

  /**
   * Updates the uploadStatus field in the stored metadata.
   * Writes directly from the in-memory metadata object — no S3 read needed.
   */
  private async updateUploadStatus(
    uploadId: string,
    metadata: IAppMetadata,
    status: 'uploading' | 'ready' | 'failed',
  ): Promise<void> {
    try {
      metadata.uploadStatus = status;
      const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8');
      await this.storageService.saveFile(
        `${uploadId}/metadata.json`,
        metadataBuffer,
        'application/json',
      );
      this.metadataCacheService.set(`${uploadId}/metadata.json`, metadataBuffer);
    } catch (err) {
      this.logger.warn(`Failed to update upload status for ${uploadId}:`, err);
    }
  }
}
