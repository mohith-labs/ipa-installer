import { Module } from '@nestjs/common';
import { ManifestController } from './manifest.controller';
import { ManifestGeneratorService } from '../services/manifest-generator.service';

@Module({
  controllers: [ManifestController],
  providers: [ManifestGeneratorService],
})
export class ManifestModule {}
