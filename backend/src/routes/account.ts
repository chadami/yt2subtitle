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
    const freeCanGenerate = entitlement.plan === "free" && entitlement.status === "active";
    res.json({
      plan: entitlement.plan,
      status: entitlement.status,
      validUntil: entitlement.validUntil,
      canUsePublicSubtitles: entitlement.canUsePublicSubtitles,
      canContribute: entitlement.canContribute,
      generation: {
        unlimited: entitlement.unlimitedGeneration,
        usedVideos,
        remainingVideos: entitlement.unlimitedGeneration
          ? null
          : freeCanGenerate ? Math.max(0, 5 - usedVideos) : 0
      }
    });
  } catch (error) {
    next(error);
  }
});
