import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterError } from 'multer';
import { Response } from 'express';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  constructor(private readonly configService: ConfigService) {}

  catch(exception: MulterError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception.code === 'LIMIT_FILE_SIZE') {
      const maxBytes = this.configService.get<number>('app.maxFileSize', 1073741824);
      const maxMB = Math.round(maxBytes / (1024 * 1024));
      const sizeLabel = maxMB >= 1024 ? `${(maxMB / 1024).toFixed(0)} GB` : `${maxMB} MB`;

      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        success: false,
        error: `File too large. Maximum size is ${sizeLabel}.`,
      });
    } else {
      response.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: exception.message,
      });
    }
  }
}
