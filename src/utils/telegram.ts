import type { Api, RawApi } from "grammy";

type DownloadedTelegramFile = {
  data: Buffer;
  mimeType: string;
  filePath: string;
};

function inferMimeTypeFromFilePath(filePath: string): string {
  const normalized = filePath.toLowerCase();

  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".heic")) return "image/heic";
  if (normalized.endsWith(".heif")) return "image/heif";
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".mov")) return "video/quicktime";
  if (normalized.endsWith(".webm")) return "video/webm";
  if (normalized.endsWith(".ogg")) return "audio/ogg";

  return "application/octet-stream";
}

function normalizeMimeType(contentTypeHeader: string | null): string | null {
  if (!contentTypeHeader) {
    return null;
  }

  const value = contentTypeHeader.split(";")[0]?.trim();
  return value && value.length > 0 ? value : null;
}

export async function getAvatarFileId(
  api: Api<RawApi>,
  userId: number
): Promise<string | null> {
  try {
    const photos = await api.getUserProfilePhotos(userId, { limit: 1 });
    return photos.photos[0]?.[0]?.file_id ?? null;
  } catch {
    return null;
  }
}

export async function downloadTelegramFileWithMeta(
  api: Api<RawApi>,
  token: string,
  fileId: string
): Promise<DownloadedTelegramFile> {
  const file = await api.getFile(fileId);

  if (!file.file_path) {
    throw new Error("Telegram API did not return file_path");
  }

  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = normalizeMimeType(response.headers.get("content-type"))
    ?? inferMimeTypeFromFilePath(file.file_path);

  return {
    data: Buffer.from(arrayBuffer),
    mimeType,
    filePath: file.file_path
  };
}

export async function downloadTelegramFile(
  api: Api<RawApi>,
  token: string,
  fileId: string
): Promise<Buffer> {
  const file = await downloadTelegramFileWithMeta(api, token, fileId);
  return file.data;
}
