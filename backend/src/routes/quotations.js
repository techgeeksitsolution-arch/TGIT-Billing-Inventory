import { Router } from "express";
import { listQuotations, getQuotation, createQuotation, updateQuotation, finalizeQuotation, cancelQuotation } from "../services/quotationService.js";
import { getOrCreateOrgAndUser } from "../db.js";

export const quotationsRouter = Router();

quotationsRouter.get("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const result = await listQuotations(org.id, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      status: req.query.status || undefined,
      search: req.query.search || undefined,
    });
    res.json(result);
  } catch (e) { next(e); }
});

quotationsRouter.get("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const quotation = await getQuotation(req.params.id, org.id);
    if (!quotation) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Quotation not found" } });
    res.json(quotation);
  } catch (e) { next(e); }
});

quotationsRouter.post("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const quotation = await createQuotation(org.id, req.body);
    res.status(201).json(quotation);
  } catch (e) { next(e); }
});

quotationsRouter.put("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const quotation = await updateQuotation(req.params.id, org.id, req.body);
    res.json(quotation);
  } catch (e) { next(e); }
});

quotationsRouter.post("/:id/finalize", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const quotation = await finalizeQuotation(req.params.id, org.id);
    res.json(quotation);
  } catch (e) { next(e); }
});

quotationsRouter.post("/:id/cancel", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const quotation = await cancelQuotation(req.params.id, org.id);
    res.json(quotation);
  } catch (e) { next(e); }
});
