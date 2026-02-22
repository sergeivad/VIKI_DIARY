import { randomBytes } from "node:crypto";

export function generateInviteToken(size = 24): string {
  return randomBytes(size).toString("base64url");
}
