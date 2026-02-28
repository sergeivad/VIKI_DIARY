export const SummaryErrorCode = {
  noEntries: "NO_ENTRIES",
  generationFailed: "GENERATION_FAILED"
} as const;

export type SummaryErrorCodeValue = (typeof SummaryErrorCode)[keyof typeof SummaryErrorCode];

export class SummaryDomainError extends Error {
  constructor(
    public readonly code: SummaryErrorCodeValue,
    message: string
  ) {
    super(message);
    this.name = "SummaryDomainError";
  }
}

export function isSummaryDomainError(error: unknown): error is SummaryDomainError {
  return error instanceof SummaryDomainError;
}
