import type { Api, RawApi } from "grammy";

export async function downloadTelegramFile(
  api: Api<RawApi>,
  token: string,
  fileId: string
): Promise<Buffer> {
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
  return Buffer.from(arrayBuffer);
}
