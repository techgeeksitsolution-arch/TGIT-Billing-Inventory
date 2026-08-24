import { Router } from "express";
import {
  listPurchases, getPurchase, createPurchase, updatePurchase, finalizePurchase, cancelPurchase,
} from "../services/purchaseService.js";
import { getOrCreateOrgAndUser } from "../db.js";

export const purchasesRouter = Router();

purchasesRouter.get("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const result = await listPurchases(org.id, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      status: req.query.status || undefined,
      search: req.query.search || undefined,
    });
    res.json(result);
  } catch (e) { next(e); }
});

purchasesRouter.get("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const purchase = await getPurchase(req.params.id, org.id);
    if (!purchase) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Purchase not found" } });
    res.json(purchase);
  } catch (e) { next(e); }
});

purchasesRouter.post("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const purchase = await createPurchase(org.id, req.body);
    res.status(201).json(purchase);
  } catch (e) { next(e); }
});

purchasesRouter.put("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const purchase = await updatePurchase(req.params.id, org.id, req.body);
    res.json(purchase);
  } catch (e) { next(e); }
});

purchasesRouter.post("/:id/finalize", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const purchase = await finalizePurchase(req.params.id, org.id);
    res.json(purchase);
  } catch (e) { next(e); }
});

purchasesRouter.post("/:id/cancel", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const purchase = await cancelPurchase(req.params.id, org.id);
    res.json(purchase);
  } catch (e) { next(e); }
});
