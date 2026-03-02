import { Controller, Get, Param, Res, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller()
export class AppInfoController {
  constructor(private readonly configService: ConfigService) {}

  /** Serve install.html for /app/:id routes */
  @Get('app/:id')
  serveInstallPage(@Res() res: Response): void {
    const installHtml = path.join(
      process.cwd(),
      'public',
      'install.html',
    );
    res.sendFile(installHtml);
  }

  /** GET /api/app/:id — Return metadata JSON */
  @Get('api/app/:id')
  getAppMetadata(
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
      res
        .status(HttpStatus.NOT_FOUND)
        .json({ error: 'App not found or link has expired' });
      return;
    }

    const metadata = JSON.parse(
      fs.readFileSync(metadataPath, 'utf8'),
    );

    res.json({
      metadata,
      iconUrl: `${baseUrl}/api/icon/${id}`,
      itmsLink: `itms-services://?action=download-manifest&url=${encodeURIComponent(`${baseUrl}/api/manifest/${id}`)}`,
    });
  }

  /** GET /api/icon/:id — Serve app icon PNG or default icon */
  @Get('api/icon/:id')
  getIcon(
    @Param('id') id: string,
    @Res() res: Response,
  ): void {
    const uploadDir = this.configService.get<string>(
      'app.uploadDir',
      './uploads',
    );
    const iconPath = path.join(uploadDir, id, 'icon.png');
    const defaultIcon = path.join(
      process.cwd(),
      'public',
      'images',
      'default-icon.png',
    );

    res.set('Content-Type', 'image/png');
    if (fs.existsSync(iconPath)) {
      res.sendFile(path.resolve(iconPath));
    } else {
      res.sendFile(path.resolve(defaultIcon));
    }
  }

  /** GET /api/download/:id — Serve IPA file for OTA installation */
  @Get('api/download/:id')
  downloadIpa(
    @Param('id') id: string,
    @Res() res: Response,
  ): void {
    const uploadDir = this.configService.get<string>(
      'app.uploadDir',
      './uploads',
    );
    const ipaPath = path.join(uploadDir, id, 'app.ipa');

    if (!fs.existsSync(ipaPath)) {
      res.status(HttpStatus.NOT_FOUND).send('File not found');
      return;
    }

    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment; filename="app.ipa"');
    res.sendFile(path.resolve(ipaPath));
  }
}
