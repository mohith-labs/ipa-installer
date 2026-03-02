import {
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
  UseFilters,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { UploadService } from './upload.service';
import { MulterExceptionFilter } from '../common/filters/multer-exception.filter';

@Controller('api')
@UseFilters(MulterExceptionFilter)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('ipa'))
  async uploadIpa(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { uploadId?: string },
  ) {
    if (!file) {
      throw new HttpException(
        { success: false, error: 'No IPA file uploaded' },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.uploadService.processUpload(file, req.uploadId!);
  }
}
