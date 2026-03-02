export interface IAppMetadata {
  name: string;
  bundleId: string;
  version: string;
  buildNumber: string;
  minimumOSVersion: string;
  id?: string;
  installUrl?: string;
  itmsLink?: string;
  uploadedAt?: string;
  fileSize?: number;
}
