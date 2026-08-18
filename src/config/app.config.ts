import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  baseUrl: process.env.BASE_URL ?? 'https://localhost:3000',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE ?? '1073741824', 10),
  retentionHours: parseInt(process.env.RETENTION_HOURS ?? '48', 10),
  storageType: (process.env.STORAGE_TYPE ?? 'local') as 'local' | 's3',
  s3: {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    // When true, IPA downloads stream through the server instead of
    // redirecting to a signed S3 URL. Useful when the S3 server is
    // slower than the VPS network (e.g. self-hosted MinIO/9Drive).
    proxyDownloads: process.env.S3_PROXY_DOWNLOADS === 'true',
  },
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
}));
