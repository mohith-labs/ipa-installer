import { Injectable } from '@nestjs/common';
import * as plist from 'plist';
import { IManifestOptions } from '../common/interfaces/manifest-options.interface';

@Injectable()
export class ManifestGeneratorService {
  generateManifest(options: IManifestOptions): string {
    const manifest = {
      items: [
        {
          assets: [
            {
              kind: 'software-package',
              url: options.ipaUrl,
            },
            {
              kind: 'display-image',
              'needs-shine': true,
              url: options.iconUrl,
            },
            {
              kind: 'full-size-image',
              'needs-shine': true,
              url: options.iconUrl,
            },
          ],
          metadata: {
            'bundle-identifier': options.bundleId,
            'bundle-version': options.version,
            kind: 'software',
            title: options.title,
          },
        },
      ],
    };

    return plist.build(manifest);
  }
}
