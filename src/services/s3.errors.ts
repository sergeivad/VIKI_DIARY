export const S3ErrorCode = {
  uploadFailed: "UPLOAD_FAILED",
  fileTooLarge: "FILE_TOO_LARGE",
  unsupportedMediaType: "UNSUPPORTED_MEDIA_TYPE",
  s3NotConfigured: "S3_NOT_CONFIGURED",
} as const;

export type S3ErrorCodeValue = (typeof S3ErrorCode)[keyof typeof S3ErrorCode];

export class S3DomainError extends Error {
  constructor(
    public readonly code: S3ErrorCodeValue,
    message: string,
  ) {
    super(message);
    this.name = "S3DomainError";
  }
}
