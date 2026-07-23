import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ValidateUploadIdPipe implements PipeTransform {
  transform(value: string): string {
    if (!UUID_REGEX.test(value)) {
      throw new BadRequestException('Invalid app ID');
    }
    return value;
  }
}
