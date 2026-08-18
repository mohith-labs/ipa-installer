import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { IpaParserService } from '../services/ipa-parser.service';
import { QrGeneratorService } from '../services/qr-generator.service';
import { STORAGE_SERVICE, IStorageService } from '../common/interfaces/storage.interface';
import { MetadataCacheService } from '../services/metadata-cache.service';
import { IpaCacheService } from '../services/ipa-cache.service';
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
    private readonly ipaCacheService: IpaCacheService,
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
        // Upload everything to S3 in the background — don't block the response.
        // The user gets the QR code immediately. Metadata and icon are served
        // from the in-memory cache until S3 catches up. The install page works
        // instantly because getAppMetadata and getManifest check cache first.
        const ipaPath = path.join(outputDir, 'app.ipa');
        const iconPath = path.join(outputDir, 'icon.png');
        const iconBuffer = fs.existsSync(iconPath)
          ? fs.readFileSync(iconPath)
          : null;

        this.uploadAllToS3InBackground(
          uploadId, ipaPath, outputDir, metadata,
          Buffer.from(metadataJson, 'utf-8'), iconBuffer,
        );
      } else {
        // For local mode, just write the enriched metadata (files already in place)
        fs.writeFileSync(path.join(outputDir, 'metadata.json'), metadataJson);
      }

      // Populate caches so install page / manifest are instant (no S3 needed)
      const metadataKey = `${uploadId}/metadata.json`;
      this.metadataCacheService.set(metadataKey, Buffer.from(metadataJson, 'utf-8'));
      if (storageType === 's3') {
        const iconPath = path.join(outputDir, 'icon.png');
        if (fs.existsSync(iconPath)) {
          this.metadataCacheService.set(
            `${uploadId}/icon.png`,
            fs.readFileSync(iconPath),
          );
        }
      }

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
   * Uploads all files (metadata, icon, IPA) to S3 in the background.
   * None of these block the upload response — everything is served from
   * the in-memory cache until S3 catches up.
   */
  private uploadAllToS3InBackground(
    uploadId: string,
    ipaPath: string,
    tempDir: string,
    metadata: IAppMetadata,
    metadataBuffer: Buffer,
    iconBuffer: Buffer | null,
  ): void {
    const maxRetries = 3;

    const uploadWithRetry = async (
      label: string,
      fn: () => Promise<void>,
    ): Promise<boolean> => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await fn();
          return true;
        } catch (err) {
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            this.logger.warn(
              `S3 upload ${label} for ${uploadId} failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            this.logger.error(
              `S3 upload ${label} for ${uploadId} failed permanently after ${maxRetries} attempts:`,
              err,
            );
          }
        }
      }
      return false;
    };

    // Cache the IPA on disk before the temp dir is cleaned up.
    // This makes repeat downloads instant (served from VPS disk instead of S3).
    this.ipaCacheService.cacheFromPath(uploadId, ipaPath);

    // Upload metadata + icon + IPA all in parallel
    const tasks: Promise<boolean>[] = [];

    tasks.push(uploadWithRetry('metadata', () =>
      this.storageService.saveFile(
        `${uploadId}/metadata.json`, metadataBuffer, 'application/json',
      ),
    ));

    if (iconBuffer) {
      tasks.push(uploadWithRetry('icon', () =>
        this.storageService.saveFile(
          `${uploadId}/icon.png`, iconBuffer, 'image/png',
        ),
      ));
    }

    tasks.push(uploadWithRetry('ipa', () => {
      const ipaStream = fs.createReadStream(ipaPath);
      return this.storageService.saveFile(
        `${uploadId}/app.ipa`, ipaStream, 'application/octet-stream',
      );
    }));

    Promise.all(tasks).then(async (results) => {
      const allSucceeded = results.every(Boolean);
      await this.updateUploadStatus(
        uploadId, metadata, allSucceeded ? 'ready' : 'failed',
      );
      if (allSucceeded) {
        this.logger.log(`All S3 uploads complete: ${uploadId}`);
      }
    }).finally(() => {
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
