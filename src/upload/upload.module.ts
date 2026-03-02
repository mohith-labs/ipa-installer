import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { MulterConfigService } from './multer-config.service';
import { IpaParserService } from '../services/ipa-parser.service';
import { QrGeneratorService } from '../services/qr-generator.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      useClass: MulterConfigService,
    }),
  ],
  controllers: [UploadController],
  providers: [
    UploadService,
    IpaParserService,
    QrGeneratorService,
  ],
})
export class UploadModule {}
