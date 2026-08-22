import { Router } from "express";
import { prisma, getOrCreateOrgAndUser } from "../db.js";
import { getCurrentFinancialYear } from "../lib/utils.js";

export const settingsRouter = Router();

const FY_KEY = "activeFinancialYear";

settingsRouter.get("/financial-year", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const setting = await prisma.setting.findUnique({
      where: { organizationId_key: { organizationId: org.id, key: FY_KEY } },
    });
    const value = setting?.value || getCurrentFinancialYear();
    res.json({ financialYear: value });
  } catch (e) { next(e); }
});

settingsRouter.put("/financial-year", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const { financialYear } = req.body;
    if (!financialYear || typeof financialYear !== "string") {
      return res.status(400).json({ error: { code: "INVALID_INPUT", message: "financialYear is required" } });
    }
    if (!/^\d{2}-\d{2}$/.test(financialYear)) {
      return res.status(400).json({ error: { code: "INVALID_FORMAT", message: "Financial year must be in YY-YY format (e.g. 26-27)" } });
    }
    await prisma.setting.upsert({
      where: { organizationId_key: { organizationId: org.id, key: FY_KEY } },
      update: { value: financialYear },
      create: { organizationId: org.id, key: FY_KEY, value: financialYear },
    });
    res.json({ financialYear });
  } catch (e) { next(e); }
});
