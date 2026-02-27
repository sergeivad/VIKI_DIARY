import type { Baby, PaginatedEntries, DiaryEntry, SummaryResponse, Author } from "./types";

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

  createEntry(babyId: string, text: string, eventDate?: string): Promise<DiaryEntry> {
    return this.request("/entries", {
      method: "POST",
      body: JSON.stringify({ babyId, text, eventDate }),
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

  getSummary(month: number, year: number): Promise<SummaryResponse> {
    return this.request("/summary", {
      method: "POST",
      body: JSON.stringify({ month, year }),
    });
  }

  mediaUrl(fileId: string): string {
    return `${this.baseUrl}/media/${encodeURIComponent(fileId)}`;
  }
}

export const api = new ApiClient();
