import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import appConfig from './config/app.config';
import { UploadModule } from './upload/upload.module';
import { AppInfoModule } from './app-info/app-info.module';
import { ManifestModule } from './manifest/manifest.module';
import { CleanupModule } from './cleanup/cleanup.module';

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
    UploadModule,
    AppInfoModule,
    ManifestModule,
    CleanupModule,
  ],
})
export class AppModule {}
