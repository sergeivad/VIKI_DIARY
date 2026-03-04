import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { S3DomainError, S3ErrorCode } from "./s3.errors.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

export type S3Config = {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
};

export type UploadResult = {
  s3Key: string;
  mimeType: string;
  size: number;
};

export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    });
  }

  validateFile(mimeType: string, size: number): void {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new S3DomainError(
        S3ErrorCode.unsupportedMediaType,
        `Unsupported file type: ${mimeType}`,
      );
    }

    if (size > MAX_FILE_SIZE) {
      throw new S3DomainError(
        S3ErrorCode.fileTooLarge,
        `File too large: ${Math.round(size / 1024 / 1024)}MB (max 50MB)`,
      );
    }
  }

  async upload(
    buffer: Buffer,
    mimeType: string,
    prefix: string,
  ): Promise<UploadResult> {
    this.validateFile(mimeType, buffer.length);
    const ext = MIME_TO_EXT[mimeType] ?? "";
    const s3Key = `${prefix}/${randomUUID()}${ext}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: mimeType,
        }),
      );
    } catch (err) {
      throw new S3DomainError(
        S3ErrorCode.uploadFailed,
        `Failed to upload to S3: ${(err as Error).message}`,
      );
    }

    return {
      s3Key,
      mimeType,
      size: buffer.length,
    };
  }

  async getPresignedUrl(s3Key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async delete(s3Key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      }),
    );
  }

  isVideo(mimeType: string): boolean {
    return mimeType.startsWith("video/");
  }
}
