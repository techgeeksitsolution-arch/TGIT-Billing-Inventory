import { Router } from "express";
import { prisma } from "../db.js";

export const taxRatesRouter = Router();

taxRatesRouter.get("/", async (req, res, next) => {
  try {
    const rates = await prisma.taxRate.findMany({ orderBy: { rate: "asc" } });
    res.json(rates);
  } catch (e) { next(e); }
});
