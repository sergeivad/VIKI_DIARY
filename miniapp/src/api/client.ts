import type {
  Author,
  Baby,
  DiaryEntry,
  PaginatedEntries,
  SummaryResponse,
  UploadResult,
} from "./types";

class ApiClient {
  private baseUrl: string;
  private initData: string = "";

  constructor(baseUrl: string = "/api/v1") {
    this.baseUrl = baseUrl;
  }

  setInitData(initData: string) {
    this.initData = initData;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `tma ${this.initData}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `API error: ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  getBaby(): Promise<Baby> {
    return this.request("/baby");
  }

  getMembers(): Promise<Author[]> {
    return this.request("/baby/members");
  }

  getEntries(babyId: string, page = 1, limit = 20): Promise<PaginatedEntries> {
    return this.request(`/entries?babyId=${babyId}&page=${page}&limit=${limit}`);
  }

  getEntry(entryId: string): Promise<DiaryEntry> {
    return this.request(`/entries/${entryId}`);
  }

  async uploadFile(file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${this.baseUrl}/upload`, {
      method: "POST",
      headers: {
        Authorization: `tma ${this.initData}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Upload failed: ${res.status}`);
    }

    return res.json();
  }

  createEntry(
    babyId: string,
    text: string,
    eventDate?: string,
    media?: Array<{ s3Key: string; thumbnailS3Key?: string; type: "photo" | "video" }>,
  ): Promise<DiaryEntry> {
    return this.request("/entries", {
      method: "POST",
      body: JSON.stringify({ babyId, text: text || undefined, eventDate, media }),
    });
  }

  addMediaToEntry(
    entryId: string,
    media: Array<{ s3Key: string; thumbnailS3Key?: string; type: "photo" | "video" }>,
  ): Promise<DiaryEntry> {
    return this.request(`/entries/${entryId}/media`, {
      method: "POST",
      body: JSON.stringify({ media }),
    });
  }

  updateEntryText(entryId: string, text: string): Promise<DiaryEntry> {
    return this.request(`/entries/${entryId}/text`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    });
  }

  updateEntryDate(entryId: string, eventDate: string): Promise<DiaryEntry> {
    return this.request(`/entries/${entryId}/date`, {
      method: "PATCH",
      body: JSON.stringify({ eventDate }),
    });
  }

  deleteEntry(entryId: string): Promise<void> {
    return this.request(`/entries/${entryId}`, { method: "DELETE" });
  }

  async getSummary(month: number, year: number): Promise<SummaryResponse | null> {
    const res = await fetch(`${this.baseUrl}/summary?month=${month}&year=${year}`, {
      headers: {
        Authorization: `tma ${this.initData}`,
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `API error: ${res.status}`);
    }
    return res.json();
  }

  generateSummary(month: number, year: number): Promise<SummaryResponse> {
    return this.request("/summary", {
      method: "POST",
      body: JSON.stringify({ month, year }),
    });
  }

  mediaUrl(
    item: {
      fileId: string | null;
      s3Key: string | null;
      thumbnailFileId?: string | null;
      thumbnailS3Key?: string | null;
    },
    thumbnail = false,
  ): string {
    if (thumbnail) {
      if (item.thumbnailS3Key) {
        return `${this.baseUrl}/media/${encodeURIComponent(item.thumbnailS3Key)}?source=s3`;
      }
      if (item.thumbnailFileId) {
        return `${this.baseUrl}/media/${encodeURIComponent(item.thumbnailFileId)}`;
      }
    }

    if (item.s3Key) {
      return `${this.baseUrl}/media/${encodeURIComponent(item.s3Key)}?source=s3`;
    }
    if (item.fileId) {
      return `${this.baseUrl}/media/${encodeURIComponent(item.fileId)}`;
    }

    return "";
  }

  mediaUrlByFileId(fileId: string): string {
    return `${this.baseUrl}/media/${encodeURIComponent(fileId)}`;
  }
}

export const api = new ApiClient();
