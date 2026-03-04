import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../../../src/config/logger.js", () => ({
  logger: { error: vi.fn() },
}));

import { apiErrorHandler } from "../../../src/api/middleware/errorHandler.js";
import { DiaryDomainError, DiaryErrorCode } from "../../../src/services/diary.errors.js";
import { InviteDomainError, InviteErrorCode } from "../../../src/services/invite.errors.js";
import { S3DomainError, S3ErrorCode } from "../../../src/services/s3.errors.js";
import { SummaryDomainError, SummaryErrorCode } from "../../../src/services/summary.errors.js";

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const req = {} as Request;
const next = vi.fn() as NextFunction;

describe("apiErrorHandler", () => {
  it("maps ENTRY_NOT_FOUND to 404", () => {
    const err = new DiaryDomainError(DiaryErrorCode.entryNotFound, "Not found");
    const res = mockRes();
    apiErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("maps ENTRY_ACCESS_DENIED to 403", () => {
    const err = new DiaryDomainError(DiaryErrorCode.entryAccessDenied, "Denied");
    const res = mockRes();
    apiErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("maps INVITE_TOKEN_INVALID to 400", () => {
    const err = new InviteDomainError(InviteErrorCode.inviteTokenInvalid, "Bad token");
    const res = mockRes();
    apiErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("maps NO_ENTRIES summary error to 422", () => {
    const err = new SummaryDomainError(SummaryErrorCode.noEntries, "No entries");
    const res = mockRes();
    apiErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("maps UNSUPPORTED_MEDIA_TYPE to 415", () => {
    const err = new S3DomainError(S3ErrorCode.unsupportedMediaType, "Unsupported");
    const res = mockRes();
    apiErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(415);
  });

  it("returns 500 for unknown errors", () => {
    const err = new Error("Boom");
    const res = mockRes();
    apiErrorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
