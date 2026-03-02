import { Injectable, Logger } from '@nestjs/common';
import * as yauzl from 'yauzl';
import * as plist from 'plist';
import * as bplistParser from 'bplist-parser';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';
import { IAppMetadata } from '../common/interfaces/app-metadata.interface';

@Injectable()
export class IpaParserService {
  private readonly logger = new Logger(IpaParserService.name);

  parseIPA(ipaPath: string, outputDir: string): Promise<IAppMetadata> {
    return new Promise((resolve, reject) => {
      yauzl.open(ipaPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(err);

        let infoPlistBuffer: Buffer | null = null;
        let appDirName: string | null = null;
        const entries: string[] = [];

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          const dirMatch = entry.fileName.match(/^Payload\/([^/]+\.app)\//);
          if (dirMatch && !appDirName) {
            appDirName = dirMatch[1];
          }

          entries.push(entry.fileName);

          if (/^Payload\/[^/]+\.app\/Info\.plist$/.test(entry.fileName)) {
            zipfile.openReadStream(entry, (err, stream) => {
              if (err) return reject(err);
              const chunks: Buffer[] = [];
              stream.on('data', (chunk: Buffer) => chunks.push(chunk));
              stream.on('end', () => {
                infoPlistBuffer = Buffer.concat(chunks);
                zipfile.readEntry();
              });
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', async () => {
          if (!infoPlistBuffer) {
            return reject(new Error('Info.plist not found in IPA'));
          }

          // Parse plist — try XML first, then binary
          let infoPlist: any;
          try {
            infoPlist = plist.parse(infoPlistBuffer.toString('utf8'));
          } catch {
            try {
              const parsed = bplistParser.parseBuffer(infoPlistBuffer);
              infoPlist = parsed[0];
            } catch {
              return reject(
                new Error(
                  'Could not parse Info.plist (tried XML and binary formats)',
                ),
              );
            }
          }

          const metadata: IAppMetadata = {
            name:
              infoPlist.CFBundleDisplayName ||
              infoPlist.CFBundleName ||
              'Unknown App',
            bundleId:
              infoPlist.CFBundleIdentifier || 'unknown.bundle.id',
            version:
              infoPlist.CFBundleShortVersionString ||
              infoPlist.CFBundleVersion ||
              '1.0',
            buildNumber: infoPlist.CFBundleVersion || '1',
            minimumOSVersion: infoPlist.MinimumOSVersion || 'N/A',
          };

          // Determine icon filename from plist
          let iconBaseName: string | null = null;
          const icons = infoPlist.CFBundleIcons;
          if (
            icons?.CFBundlePrimaryIcon?.CFBundleIconFiles
          ) {
            const iconFiles =
              icons.CFBundlePrimaryIcon.CFBundleIconFiles;
            iconBaseName = iconFiles[iconFiles.length - 1];
          }

          // Also check iPad icons
          if (!iconBaseName) {
            const iPadIcons = infoPlist['CFBundleIcons~ipad'];
            if (
              iPadIcons?.CFBundlePrimaryIcon?.CFBundleIconFiles
            ) {
              const iconFiles =
                iPadIcons.CFBundlePrimaryIcon.CFBundleIconFiles;
              iconBaseName = iconFiles[iconFiles.length - 1];
            }
          }

          // Legacy icon key fallback
          if (!iconBaseName && infoPlist.CFBundleIconFile) {
            iconBaseName = infoPlist.CFBundleIconFile;
          }

          // Save metadata
          fs.writeFileSync(
            path.join(outputDir, 'metadata.json'),
            JSON.stringify(metadata, null, 2),
          );

          // Extract icon if we found a name
          if (iconBaseName && appDirName) {
            try {
              await this.extractIcon(
                ipaPath,
                appDirName,
                iconBaseName,
                entries,
                outputDir,
              );
            } catch (iconErr: any) {
              this.logger.warn(
                `Could not extract icon: ${iconErr.message}`,
              );
            }
          }

          resolve(metadata);
        });

        zipfile.on('error', reject);
      });
    });
  }

  private extractIcon(
    ipaPath: string,
    appDirName: string,
    iconBaseName: string,
    entryNames: string[],
    outputDir: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const prefix = `Payload/${appDirName}/${iconBaseName}`;
      const candidates = [
        `${prefix}@3x.png`,
        `${prefix}@2x.png`,
        `${prefix}.png`,
        `${prefix}@3x~iphone.png`,
        `${prefix}@2x~iphone.png`,
      ];

      let targetEntry: string | null = null;
      for (const candidate of candidates) {
        if (entryNames.includes(candidate)) {
          targetEntry = candidate;
          break;
        }
      }

      if (!targetEntry) {
        const matching = entryNames
          .filter(
            (name) =>
              name.startsWith(prefix) && name.endsWith('.png'),
          )
          .sort((a, b) => b.length - a.length);
        if (matching.length > 0) {
          targetEntry = matching[0];
        }
      }

      if (!targetEntry) {
        return reject(
          new Error(
            `Icon file not found for base name: ${iconBaseName}`,
          ),
        );
      }

      const target = targetEntry;

      yauzl.open(ipaPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(err);

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          if (entry.fileName === target) {
            zipfile.openReadStream(entry, (err, stream) => {
              if (err) return reject(err);
              const chunks: Buffer[] = [];
              stream.on('data', (chunk: Buffer) => chunks.push(chunk));
              stream.on('end', async () => {
                const iconBuffer = Buffer.concat(chunks);
                const outputPath = path.join(outputDir, 'icon.png');

                try {
                  await sharp(iconBuffer)
                    .resize(256, 256)
                    .png()
                    .toFile(outputPath);
                } catch (sharpErr: any) {
                  this.logger.warn(
                    `sharp could not process icon, saving raw: ${sharpErr.message}`,
                  );
                  fs.writeFileSync(outputPath, iconBuffer);
                }

                resolve(outputPath);
              });
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', () => {
          reject(
            new Error('Icon entry not found during extraction pass'),
          );
        });

        zipfile.on('error', reject);
      });
    });
  }
}
