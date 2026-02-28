import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { UserService } from "../../services/user.service.js";
import type { AuthedRequest } from "../types.js";

export function createAuthMiddleware(userService: UserService, botToken: string) {
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization ?? "";
    if (!header.startsWith("tma ")) {
      res.status(401).json({ error: "Missing Telegram initData" });
      return;
    }

    const initData = header.slice(4);
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) {
      res.status(401).json({ error: "Missing hash" });
      return;
    }

    params.delete("hash");
    const checkString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const expected = crypto
      .createHmac("sha256", secretKey)
      .update(checkString)
      .digest("hex");

    if (expected !== hash) {
      res.status(401).json({ error: "Invalid initData signature" });
      return;
    }

    const authDate = Number(params.get("auth_date") ?? 0);
    if (Date.now() / 1000 - authDate > 3600) {
      res.status(401).json({ error: "initData expired" });
      return;
    }

    const userParam = params.get("user");
    if (!userParam) {
      res.status(401).json({ error: "No user in initData" });
      return;
    }

    let tgUser: { id: number; first_name: string; username?: string };
    try {
      tgUser = JSON.parse(userParam) as typeof tgUser;
    } catch {
      res.status(401).json({ error: "Invalid user JSON" });
      return;
    }

    const user = await userService.findOrCreateUser({
      telegramId: BigInt(tgUser.id),
      firstName: tgUser.first_name,
      username: tgUser.username ?? null,
    });

    (req as AuthedRequest).actor = {
      telegramId: BigInt(tgUser.id),
      userId: user.id,
    };

    next();
  };
}
