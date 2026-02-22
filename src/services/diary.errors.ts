export const DiaryErrorCode = {
  invalidItems: "INVALID_ITEMS",
  entryNotFound: "ENTRY_NOT_FOUND"
} as const;

export type DiaryErrorCodeValue = (typeof DiaryErrorCode)[keyof typeof DiaryErrorCode];

export class DiaryDomainError extends Error {
  constructor(
    public readonly code: DiaryErrorCodeValue,
    message: string
  ) {
    super(message);
    this.name = "DiaryDomainError";
  }
}

export function isDiaryDomainError(error: unknown): error is DiaryDomainError {
  return error instanceof DiaryDomainError;
}
