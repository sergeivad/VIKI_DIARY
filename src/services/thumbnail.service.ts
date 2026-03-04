import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { logger } from "../config/logger.js";

const execFileAsync = promisify(execFile);

export class ThumbnailService {
  async extractVideoThumbnail(videoBuffer: Buffer): Promise<Buffer | null> {
    const tempDir = await mkdtemp(join(tmpdir(), "thumb-"));
    const inputPath = join(tempDir, `${randomUUID()}.mp4`);
    const outputPath = join(tempDir, `${randomUUID()}.jpg`);

    try {
      await writeFile(inputPath, videoBuffer);
      await execFileAsync(
        "ffmpeg",
        [
          "-i",
          inputPath,
          "-ss",
          "1",
          "-vframes",
          "1",
          "-vf",
          "scale=320:-1",
          "-q:v",
          "5",
          "-f",
          "image2",
          outputPath,
        ],
        { timeout: 15_000 },
      );

      return await readFile(outputPath);
    } catch (err) {
      logger.warn({ err }, "Failed to extract video thumbnail");
      return null;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
