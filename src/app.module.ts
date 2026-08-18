import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { MetadataCacheService } from './services/metadata-cache.service';
import appConfig from './config/app.config';
import { StorageModule } from './storage/storage.module';
import { UploadModule } from './upload/upload.module';
import { AppInfoModule } from './app-info/app-info.module';
import { ManifestModule } from './manifest/manifest.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { AppsListModule } from './apps-list/apps-list.module';
import { HealthModule } from './health/health.module';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
    }),
    StorageModule,
    UploadModule,
    AppInfoModule,
    ManifestModule,
    CleanupModule,
    AppsListModule,
    HealthModule,
  ],
  providers: [MetadataCacheService],
  exports: [MetadataCacheService],
})
export class AppModule {}
