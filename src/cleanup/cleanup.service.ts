import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly configService: ConfigService) {}

  @Cron(CronExpression.EVERY_HOUR)
  handleCleanup(): void {
    const uploadDir = this.configService.get<string>(
      'app.uploadDir',
      './uploads',
    );
    const retentionHours = this.configService.get<number>(
      'app.retentionHours',
      48,
    );
    const retentionMs = retentionHours * 60 * 60 * 1000;

    if (!fs.existsSync(uploadDir)) return;

    const dirs = fs.readdirSync(uploadDir);
    const now = Date.now();

    for (const dir of dirs) {
      const metaPath = path.join(uploadDir, dir, 'metadata.json');
      try {
        const meta = JSON.parse(
          fs.readFileSync(metaPath, 'utf8'),
        );
        const uploadedAt = new Date(meta.uploadedAt).getTime();
        if (now - uploadedAt > retentionMs) {
          fs.rmSync(path.join(uploadDir, dir), {
            recursive: true,
            force: true,
          });
          this.logger.log(`Cleaned up expired upload: ${dir}`);
        }
      } catch {
        try {
          const stat = fs.statSync(path.join(uploadDir, dir));
          if (now - stat.mtimeMs > retentionMs) {
            fs.rmSync(path.join(uploadDir, dir), {
              recursive: true,
              force: true,
            });
            this.logger.log(
              `Cleaned up stale upload directory: ${dir}`,
            );
          }
        } catch {
          // Directory may have been removed between readdir and stat
        }
      }
    }
  }
}
