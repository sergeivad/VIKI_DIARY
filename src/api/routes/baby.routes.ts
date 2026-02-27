import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { BabyService } from "../../services/baby.service.js";
import type { InviteService } from "../../services/invite.service.js";
import type { AuthedRequest } from "../types.js";

export function createBabyRouter(babyService: BabyService, inviteService: InviteService): Router {
  const router = Router();

  router.get("/", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const baby = await babyService.getBabyByUser(actor.userId);
      if (!baby) {
        res.status(404).json({ error: "Baby not found" });
        return;
      }
      res.json(baby);
    } catch (err) {
      next(err);
    }
  });

  router.get("/members", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const baby = await babyService.getBabyByUser(actor.userId);
      if (!baby) {
        res.status(404).json({ error: "Baby not found" });
        return;
      }
      const members = await babyService.getMembers(baby.id);
      res.json(members);
    } catch (err) {
      next(err);
    }
  });

  router.get("/invite", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const info = await inviteService.getInviteInfoForUser(actor.userId);
      if (!info) {
        res.status(404).json({ error: "Invite info not found" });
        return;
      }
      const inviteLink = inviteService.buildInviteLink(info.inviteToken);
      res.json({
        inviteLink,
        babyName: info.babyName,
        role: info.role,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/invite/regenerate", async (req, res: Response, next: NextFunction) => {
    try {
      const { actor } = req as AuthedRequest;
      const baby = await babyService.getBabyByUser(actor.userId);
      if (!baby) {
        res.status(404).json({ error: "Baby not found" });
        return;
      }
      const newToken = await inviteService.regenerateInvite(baby.id, actor.userId);
      const inviteLink = inviteService.buildInviteLink(newToken);
      res.json({ inviteLink });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
