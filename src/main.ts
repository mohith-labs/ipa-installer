import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  // Check for HTTPS certs
  const certPath = path.join(process.cwd(), 'certs');
  const certFile = path.join(certPath, 'localhost.pem');
  const keyFile = path.join(certPath, 'localhost-key.pem');

  let httpsOptions: { key: Buffer; cert: Buffer } | undefined;
  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    httpsOptions = {
      key: fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
    };
  }

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    httpsOptions ? { httpsOptions } : {},
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);

  // Ensure uploads directory exists
  const uploadDir = configService.get<string>('app.uploadDir', './uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Set server timeout for large uploads (10 minutes)
  const server = app.getHttpServer();
  server.setTimeout(600000);

  await app.listen(port);

  const protocol = httpsOptions ? 'https' : 'http';
  console.log(`${protocol.toUpperCase()} server running at ${protocol}://localhost:${port}`);
  if (!httpsOptions) {
    console.log(
      'Note: iOS OTA installation requires HTTPS. See README for setup instructions.',
    );
  }
}
bootstrap();
