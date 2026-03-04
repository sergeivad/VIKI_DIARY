import { describe, expect, it } from "vitest";
import { S3DomainError, S3ErrorCode } from "../../src/services/s3.errors.js";
import { S3Service } from "../../src/services/s3.service.js";

describe("S3Service", () => {
  const config = {
    endpoint: "https://s3.test.cloud",
    bucket: "test-bucket",
    accessKey: "key",
    secretKey: "secret",
    region: "ru-1",
  };

  it("validates allowed mime types", () => {
    const service = new S3Service(config);

    expect(() => service.validateFile("image/jpeg", 1000)).not.toThrow();
    expect(() => service.validateFile("video/mp4", 1000)).not.toThrow();
  });

  it("rejects unsupported mime types", () => {
    const service = new S3Service(config);

    expect(() => service.validateFile("application/pdf", 1000)).toThrow(S3DomainError);
    expect(() => service.validateFile("application/pdf", 1000)).toThrow("Unsupported file type");
  });

  it("rejects files over 50MB", () => {
    const service = new S3Service(config);

    const overLimit = 51 * 1024 * 1024;
    expect(() => service.validateFile("image/jpeg", overLimit)).toThrow(S3DomainError);
    expect(() => service.validateFile("image/jpeg", overLimit)).toThrow("File too large");
  });

  it("isVideo detects video mime types", () => {
    const service = new S3Service(config);

    expect(service.isVideo("video/mp4")).toBe(true);
    expect(service.isVideo("video/quicktime")).toBe(true);
    expect(service.isVideo("image/jpeg")).toBe(false);
  });

  it("throws domain error with unsupported media code", () => {
    const service = new S3Service(config);

    try {
      service.validateFile("text/plain", 1_024);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(S3DomainError);
      expect((err as S3DomainError).code).toBe(S3ErrorCode.unsupportedMediaType);
    }
  });
});
