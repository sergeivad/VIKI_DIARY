import type { Request, Response, NextFunction } from "express";
import { DiaryDomainError, DiaryErrorCode } from "../../services/diary.errors.js";
import { InviteDomainError, InviteErrorCode } from "../../services/invite.errors.js";
import { SummaryDomainError, SummaryErrorCode } from "../../services/summary.errors.js";
import { logger } from "../../config/logger.js";

const diaryCodeToHttp: Record<string, number> = {
  [DiaryErrorCode.entryNotFound]: 404,
  [DiaryErrorCode.entryAccessDenied]: 403,
  [DiaryErrorCode.invalidItems]: 422,
  [DiaryErrorCode.invalidEventDate]: 422,
};

const inviteCodeToHttp: Record<string, number> = {
  [InviteErrorCode.inviteTokenInvalid]: 400,
  [InviteErrorCode.userAlreadyInDiary]: 409,
  [InviteErrorCode.babyMembershipNotFound]: 404,
  [InviteErrorCode.ownerRequired]: 403,
  [InviteErrorCode.inviteTokenGenerationFailed]: 500,
};

const summaryCodeToHttp: Record<string, number> = {
  [SummaryErrorCode.noEntries]: 422,
  [SummaryErrorCode.generationFailed]: 502,
};

export function apiErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof DiaryDomainError) {
    res.status(diaryCodeToHttp[err.code] ?? 500).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof InviteDomainError) {
    res.status(inviteCodeToHttp[err.code] ?? 500).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof SummaryDomainError) {
    res.status(summaryCodeToHttp[err.code] ?? 500).json({ error: err.message, code: err.code });
    return;
  }
  logger.error({ err }, "Unhandled API error");
  res.status(500).json({ error: "Internal server error" });
}
