import { Router } from "express";
import { listSalesInvoices, getSalesInvoice, createSalesInvoice, updateSalesInvoice, finalizeSalesInvoice, cancelSalesInvoice, checkStockAvailability } from "../services/salesService.js";
import { getOrCreateOrgAndUser } from "../db.js";

export const salesRouter = Router();

salesRouter.get("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const result = await listSalesInvoices(org.id, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      status: req.query.status || undefined,
      search: req.query.search || undefined,
    });
    res.json(result);
  } catch (e) { next(e); }
});

salesRouter.get("/stock-check", async (req, res, next) => {
  try {
    const items = JSON.parse(req.query.items || "[]");
    const warnings = await checkStockAvailability(items);
    res.json({ warnings });
  } catch (e) { next(e); }
});

salesRouter.get("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const invoice = await getSalesInvoice(req.params.id, org.id);
    if (!invoice) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Invoice not found" } });
    res.json(invoice);
  } catch (e) { next(e); }
});

salesRouter.post("/", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const invoice = await createSalesInvoice(org.id, req.body);
    res.status(201).json(invoice);
  } catch (e) { next(e); }
});

salesRouter.put("/:id", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const invoice = await updateSalesInvoice(req.params.id, org.id, req.body);
    res.json(invoice);
  } catch (e) { next(e); }
});

salesRouter.post("/:id/finalize", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const invoice = await finalizeSalesInvoice(req.params.id, org.id);
    res.json(invoice);
  } catch (e) { next(e); }
});

salesRouter.post("/:id/cancel", async (req, res, next) => {
  try {
    const { org } = await getOrCreateOrgAndUser();
    const invoice = await cancelSalesInvoice(req.params.id, org.id);
    res.json(invoice);
  } catch (e) { next(e); }
});
