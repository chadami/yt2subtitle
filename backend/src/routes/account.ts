import { Router } from "express";
import { requireUserId } from "../auth.js";
import { getGenerationUsage, getUserEntitlement } from "../entitlements.js";

export const accountRouter = Router();

accountRouter.get("/entitlements", async (req, res, next) => {
  try {
    const userId = await requireUserId(req.headers.authorization);
    const [entitlement, usedVideos] = await Promise.all([
      getUserEntitlement(userId),
      getGenerationUsage(userId)
    ]);
    res.json({
      plan: entitlement.plan,
      status: entitlement.status,
      validUntil: entitlement.validUntil,
      canUsePublicSubtitles: entitlement.canUsePublicSubtitles,
      canContribute: entitlement.canContribute,
      generation: {
        unlimited: entitlement.unlimitedGeneration,
        videoLimit: entitlement.generationVideoLimit,
        usedVideos,
        remainingVideos: entitlement.unlimitedGeneration
          ? null
          : Math.max(0, (entitlement.generationVideoLimit ?? 0) - usedVideos)
      }
    });
  } catch (error) {
    next(error);
  }
});
