export const TranscriptionErrorCode = {
  durationTooLong: "DURATION_TOO_LONG",
  transcriptionFailed: "TRANSCRIPTION_FAILED"
} as const;

export type TranscriptionErrorCodeValue =
  (typeof TranscriptionErrorCode)[keyof typeof TranscriptionErrorCode];

export class TranscriptionError extends Error {
  constructor(
    public readonly code: TranscriptionErrorCodeValue,
    message: string
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}
