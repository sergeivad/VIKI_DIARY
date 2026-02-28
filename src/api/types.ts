import type { Request } from "express";

export interface AuthenticatedActor {
  telegramId: bigint;
  userId: string;
}

export interface AuthedRequest extends Request {
  actor: AuthenticatedActor;
}
