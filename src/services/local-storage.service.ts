import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';
import { IStorageService, IFileStreamResult } from '../common/interfaces/storage.interface';

@Injectable()
export class LocalStorageService implements IStorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadDir: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = this.configService.get<string>('app.uploadDir', './uploads');
  }

  /**
   * Resolves a storage key to an absolute path and verifies it stays
   * within the upload directory to prevent path-traversal attacks.
   */
  private safePath(key: string): string {
    const resolved = path.resolve(this.uploadDir, key);
    if (!resolved.startsWith(path.resolve(this.uploadDir))) {
      throw new BadRequestException('Invalid storage key');
    }
    return resolved;
  }

  async saveFile(key: string, data: Buffer | Readable, _contentType?: string): Promise<void> {
    const filePath = this.safePath(key);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(filePath, data);
    } else {
      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(filePath);
        data.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    }
  }

  async readFile(key: string): Promise<Buffer> {
    const filePath = this.safePath(key);
    return fs.readFileSync(filePath);
  }

  async readFileStream(key: string): Promise<Readable> {
    const filePath = this.safePath(key);
    return fs.createReadStream(filePath);
  }

  async fileExists(key: string): Promise<boolean> {
    const filePath = this.safePath(key);
    return fs.existsSync(filePath);
  }

  async deleteDirectory(prefix: string): Promise<void> {
    const dirPath = this.safePath(prefix);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }

  async listDirectories(): Promise<string[]> {
    if (!fs.existsSync(this.uploadDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.uploadDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  async getLastModified(key: string): Promise<Date | undefined> {
    const filePath = this.safePath(key);
    try {
      const stat = fs.statSync(filePath);
      return stat.mtime;
    } catch {
      return undefined;
    }
  }

  async getFileStream(key: string): Promise<IFileStreamResult | null> {
    const filePath = this.safePath(key);
    try {
      const stat = fs.statSync(filePath);
      const stream = fs.createReadStream(filePath);
      return {
        stream,
        contentLength: stat.size,
      };
    } catch {
      return null;
    }
  }

  async getSignedUrl(_key: string, _expiresInSeconds?: number): Promise<string | null> {
    return null;
  }
}
