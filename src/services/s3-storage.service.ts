import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { IStorageService, IFileStreamResult, IFileInfo } from '../common/interfaces/storage.interface';

@Injectable()
export class S3StorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(S3StorageService.name);
  private s3: S3Client;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const endpoint = this.configService.get<string>('app.s3.endpoint');
    const region = this.configService.get<string>('app.s3.region', 'us-east-1');
    const accessKeyId = this.configService.get<string>('app.s3.accessKeyId', '');
    const secretAccessKey = this.configService.get<string>('app.s3.secretAccessKey', '');
    const forcePathStyle = this.configService.get<boolean>('app.s3.forcePathStyle', false);
    this.bucket = this.configService.get<string>('app.s3.bucket', '');

    if (!this.bucket) {
      throw new Error('S3_BUCKET is required when STORAGE_TYPE=s3');
    }
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_TYPE=s3');
    }

    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle,
      // Disable SDK v3 checksum headers — S3-compatible stores (MinIO, 9Drive)
      // don't understand these, causing slower signed URLs and extra overhead.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    };

    if (endpoint) {
      clientConfig.endpoint = endpoint;
    }

    this.s3 = new S3Client(clientConfig);
    this.logger.log(
      `S3 storage initialized — bucket: ${this.bucket}, region: ${region}` +
        (endpoint ? `, endpoint: ${endpoint}` : ''),
    );
  }

  async saveFile(key: string, data: Buffer | Readable, contentType?: string): Promise<void> {
    // Use multipart streaming upload — avoids buffering entire file in memory.
    // For small Buffers this still works correctly (Upload handles both).
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      },
      // 10MB parts, up to 4 concurrent part uploads
      partSize: 10 * 1024 * 1024,
      queueSize: 4,
    });

    await upload.done();
  }

  async readFile(key: string): Promise<Buffer> {
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async readFileStream(key: string): Promise<Readable> {
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    return response.Body as Readable;
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  async deleteDirectory(prefix: string): Promise<void> {
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;

    let continuationToken: string | undefined;
    do {
      const listResponse = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: normalizedPrefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = listResponse.Contents;
      if (objects && objects.length > 0) {
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: objects.map((obj) => ({ Key: obj.Key })),
              Quiet: true,
            },
          }),
        );
      }

      continuationToken = listResponse.IsTruncated
        ? listResponse.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  async listDirectories(): Promise<string[]> {
    const directories: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Delimiter: '/',
          ContinuationToken: continuationToken,
        }),
      );

      if (response.CommonPrefixes) {
        for (const prefix of response.CommonPrefixes) {
          if (prefix.Prefix) {
            // Remove trailing slash: "abc-123/" -> "abc-123"
            directories.push(prefix.Prefix.replace(/\/$/, ''));
          }
        }
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return directories;
  }

  async getLastModified(key: string): Promise<Date | undefined> {
    try {
      const response = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return response.LastModified;
    } catch {
      return undefined;
    }
  }

  async getFileStream(key: string): Promise<IFileStreamResult | null> {
    try {
      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      return {
        stream: response.Body as Readable,
        contentLength: response.ContentLength,
        contentType: response.ContentType,
      };
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async getFileInfo(key: string): Promise<IFileInfo | null> {
    try {
      const response = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return {
        contentLength: response.ContentLength,
        contentType: response.ContentType,
      };
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string | null> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }

}
