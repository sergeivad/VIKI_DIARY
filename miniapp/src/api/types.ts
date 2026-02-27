export interface Baby {
  id: string;
  name: string;
  birthDate: string;
  createdAt: string;
}

export interface Author {
  id: string;
  firstName: string;
  username: string | null;
}

export interface EntryItem {
  id: string;
  type: "text" | "photo" | "video" | "voice";
  textContent: string | null;
  fileId: string | null;
  orderIndex: number;
}

export interface DiaryEntry {
  id: string;
  babyId: string;
  authorId: string;
  eventDate: string;
  tags: string[];
  items: EntryItem[];
  author: Author;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedEntries {
  entries: DiaryEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SummaryResponse {
  summary: string;
  totalEntries: number;
  month: number;
  year: number;
  createdAt: string;
}
